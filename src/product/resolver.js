const bcrypt = require("bcryptjs");
const { signToken } = require("../auth");
const { createEmailOtp } = require("../email");

const toProductGraph = (product) => {
  if (!product) return null;

  return {
    ...product,
    price: String(product.price),
    sale: String(Boolean(product.sale)),
    discount: String(product.discount || 0),
    new: String(Boolean(product.isNew)),
    collection: product.collections || [],
    images: (product.images || [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => ({
        image_id: image.imageId,
        id: image.id,
        alt: image.alt,
        src: image.src,
      })),
    variants: (product.variants || []).map((variant) => ({
      variant_id: variant.variantId,
      id: variant.id,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      image_id: variant.imageId,
    })),
  };
};

const productInclude = {
  images: true,
  variants: true,
};

const cartInclude = {
  items: {
    include: {
      product: {
        include: productInclude,
      },
    },
  },
};

const orderInclude = {
  items: {
    include: {
      product: {
        include: productInclude,
      },
    },
  },
};

const getCartWhere = (user, sessionId) => {
  if (user) return { userId: user.id };
  if (sessionId) return { sessionId };
  throw new Error("A logged-in user or sessionId is required for cart operations.");
};

const toCartGraph = (cart) => {
  if (!cart) return null;
  const items = cart.items || [];

  return {
    ...cart,
    items: items.map((item) => ({
      ...item,
      product: toProductGraph(item.product),
      variantSize: (item.product?.variants || []).find((variant) => variant.variantId === item.variantId)?.size || null,
      total: item.price * item.quantity,
    })),
    subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
  };
};

const createOrderNumber = () => `DS-${Date.now()}`;

const parseMeasurements = (measurements) => {
  if (!measurements) return null;
  if (typeof measurements !== "string") return measurements;

  try {
    return JSON.parse(measurements);
  } catch (error) {
    return { notes: measurements };
  }
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizeOptional = (value) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const verifyGoogleToken = async (idToken) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error("Google login is not configured.");
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new Error("Invalid Google login token.");
  const profile = await response.json();

  if (profile.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("Google login token is not for this app.");
  if (profile.email_verified !== "true" && profile.email_verified !== true) throw new Error("Google email is not verified.");

  return profile;
};

const resolvers = {
  Query: {
    me: (root, args, { user }) => user,

    products: async (root, args, { prisma }) => {
      const indexFrom = args.indexFrom || 0;
      const limit = args.limit || 16;
      const where = {
        isActive: true,
      };

      if (args.type && args.type !== "all") where.type = args.type;
      if (args.brand && args.brand.length) where.brand = { in: args.brand };
      if (args.priceMin || args.priceMax) {
        where.price = {};
        if (typeof args.priceMin === "number") where.price.gte = args.priceMin;
        if (typeof args.priceMax === "number") where.price.lte = args.priceMax;
      }
      if (args.text) {
        where.OR = [
          { title: { contains: args.text, mode: "insensitive" } },
          { description: { contains: args.text, mode: "insensitive" } },
          { brand: { contains: args.text, mode: "insensitive" } },
          { category: { contains: args.text, mode: "insensitive" } },
        ];
      }
      if (args.color) {
        where.variants = {
          some: {
            color: args.color,
          },
        };
      }
      if (args.size && args.size.length) {
        where.variants = {
          ...(where.variants || {}),
          some: {
            ...((where.variants && where.variants.some) || {}),
            size: { in: args.size },
          },
        };
      }

      const orderBy =
        args.sortBy === "HighToLow"
          ? { price: "desc" }
          : args.sortBy === "LowToHigh"
          ? { price: "asc" }
          : args.sortBy === "Newest"
          ? { id: "desc" }
          : args.sortBy === "DescOrder"
          ? { title: "desc" }
          : { title: "asc" };

      const [items, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: productInclude,
          orderBy,
          skip: indexFrom,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);

      return {
        items: items.map(toProductGraph),
        total,
        hasMore: total > indexFrom + limit,
      };
    },

    product: async (root, args, { prisma }) => {
      const product = await prisma.product.findUnique({
        where: { id: args.id },
        include: {
          ...productInclude,
          reviews: {
            where: { status: "APPROVED" },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      return toProductGraph(product);
    },

    productByType: async (root, args, { prisma }) => {
      const products = await prisma.product.findMany({
        where: { type: args.type, isActive: true },
        include: productInclude,
      });
      return products.map(toProductGraph);
    },

    productByCategory: async (root, args, { prisma }) => {
      const products = await prisma.product.findMany({
        where: { category: args.category, isActive: true },
        include: productInclude,
      });
      return products.map(toProductGraph);
    },

    cart: async (root, args, { prisma, user }) => {
      const where = getCartWhere(user, args.sessionId);
      const cart = await prisma.cart.findFirst({
        where,
        include: cartInclude,
      });
      return toCartGraph(cart);
    },

    myOrders: async (root, args, { prisma, user }) => {
      if (!user) throw new Error("Login required.");
      return prisma.order.findMany({
        where: { userId: user.id },
        include: orderInclude,
        orderBy: { createdAt: "desc" },
      });
    },

    order: async (root, args, { prisma, user }) => {
      const order = await prisma.order.findUnique({
        where: { id: args.id },
        include: orderInclude,
      });
      if (!order) return null;
      if (order.userId && (!user || order.userId !== user.id)) throw new Error("Not authorized.");
      return order;
    },

    orderByNumber: async (root, args, { prisma, user }) => {
      const order = await prisma.order.findUnique({
        where: { orderNumber: args.orderNumber },
        include: orderInclude,
      });
      if (!order) return null;
      if (order.userId && (!user || order.userId !== user.id)) throw new Error("Not authorized.");
      return order;
    },

    productReviews: (root, args, { prisma }) =>
      prisma.review.findMany({
        where: { productId: args.productId, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
      }),

    fabrics: (root, args, { prisma }) =>
      prisma.fabric.findMany({
        where: { isActive: true },
        include: { images: { orderBy: { sortOrder: "asc" } } },
        orderBy: { name: "asc" },
      }),

    madeToOrderRequests: (root, args, { prisma, user }) => {
      if (!user || !user.isAdmin) throw new Error("Admin access required.");
      return prisma.madeToOrderRequest.findMany({
        include: { fabric: { include: { images: true } } },
        orderBy: { createdAt: "desc" },
      });
    },

    instagram: (root, args, { prisma }) =>
      prisma.instagram.findMany({
        where: {
          isActive: true,
          ...(args.type ? { type: args.type } : {}),
        },
      }),

    blog: (root, args, { prisma }) =>
      prisma.blog.findMany({
        where: {
          isActive: true,
          ...(args.type ? { type: args.type } : {}),
        },
      }),

    getBrands: async (root, args, { prisma }) => {
      const products = await prisma.product.findMany({
        where: {
          isActive: true,
          ...(args.type ? { type: args.type } : {}),
        },
        select: { brand: true },
      });
      return { brand: [...new Set(products.map((product) => product.brand))] };
    },

    getColors: async (root, args, { prisma }) => {
      const variants = await prisma.productVariant.findMany({
        where: {
          product: {
            isActive: true,
            ...(args.type ? { type: args.type } : {}),
          },
        },
        select: { color: true },
      });
      return { colors: [...new Set(variants.map((variant) => variant.color).filter(Boolean))] };
    },

    getSize: async (root, args, { prisma }) => {
      const variants = await prisma.productVariant.findMany({
        where: {
          product: {
            isActive: true,
            ...(args.type ? { type: args.type } : {}),
          },
        },
        select: { size: true },
      });
      return { size: [...new Set(variants.map((variant) => variant.size).filter(Boolean))] };
    },

    newProducts: async (root, args, { prisma }) => {
      const products = await prisma.product.findMany({
        where: {
          isActive: true,
          isNew: true,
          ...(args.type ? { type: args.type } : {}),
        },
        include: productInclude,
      });
      return products.map(toProductGraph);
    },

    getProducts: async (root, args, { prisma }) => {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        include: productInclude,
        take: args.limit || 16,
      });
      return products.map(toProductGraph);
    },

    getCurrency: (root, args, { prisma }) => prisma.currency.findMany(),
  },

  Mutation: {
    register: async (root, { input }, { prisma }) => {
      const email = normalizeEmail(input.email);
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) throw new Error("An account with this email already exists.");

      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await prisma.user.create({
        data: {
          firstName: normalizeOptional(input.firstName),
          lastName: normalizeOptional(input.lastName),
          email,
          phone: normalizeOptional(input.phone),
          passwordHash,
          emailVerified: true,
        },
      });

      return { token: signToken(user), user };
    },

    requestRegistrationOtp: async (root, { input }, { prisma }) => {
      const email = normalizeEmail(input.email);
      const existingUser = await prisma.user.findUnique({ where: { email } });

      if (existingUser && existingUser.emailVerified) {
        throw new Error("An account with this email already exists.");
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      const data = {
        firstName: normalizeOptional(input.firstName),
        lastName: normalizeOptional(input.lastName),
        email,
        phone: normalizeOptional(input.phone),
        passwordHash,
        emailVerified: false,
        authProvider: "email",
      };

      const user = existingUser
        ? await prisma.user.update({ where: { id: existingUser.id }, data })
        : await prisma.user.create({ data });

      const expiresAt = await createEmailOtp({ prisma, user });

      return {
        success: true,
        message: "Verification code sent to your email.",
        expiresAt: expiresAt.toISOString(),
      };
    },

    verifyRegistrationOtp: async (root, { email, otp }, { prisma }) => {
      const normalizedEmail = normalizeEmail(email);
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) throw new Error("Account not found.");
      if (user.emailVerified) return { token: signToken(user), user };

      const record = await prisma.emailOtp.findFirst({
        where: {
          userId: user.id,
          email: normalizedEmail,
          purpose: "EMAIL_VERIFICATION",
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!record) throw new Error("Verification code expired. Please request a new code.");

      const validOtp = await bcrypt.compare(String(otp || "").trim(), record.codeHash);
      if (!validOtp) throw new Error("Invalid verification code.");

      const verifiedUser = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
      await prisma.emailOtp.update({ where: { id: record.id }, data: { usedAt: new Date() } });

      return { token: signToken(verifiedUser), user: verifiedUser };
    },

    resendEmailOtp: async (root, { email }, { prisma }) => {
      const normalizedEmail = normalizeEmail(email);
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) throw new Error("Account not found.");
      if (user.emailVerified) return { success: true, message: "Email is already verified.", expiresAt: null };

      const expiresAt = await createEmailOtp({ prisma, user });
      return {
        success: true,
        message: "Verification code sent to your email.",
        expiresAt: expiresAt.toISOString(),
      };
    },

    login: async (root, { email, password }, { prisma }) => {
      const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
      if (!user) throw new Error("Invalid email or password.");
      if (!user.emailVerified) throw new Error("Please verify your email before login.");

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) throw new Error("Invalid email or password.");

      return { token: signToken(user), user };
    },

    loginWithGoogle: async (root, { idToken }, { prisma }) => {
      const googleProfile = await verifyGoogleToken(idToken);
      const email = normalizeEmail(googleProfile.email);
      const nameParts = String(googleProfile.name || "").split(" ");
      const passwordHash = await bcrypt.hash(`google:${googleProfile.sub}:${process.env.JWT_SECRET || "secret"}`, 12);

      const user = await prisma.user.upsert({
        where: { email },
        update: {
          googleId: googleProfile.sub,
          emailVerified: true,
          authProvider: "google",
          firstName: normalizeOptional(googleProfile.given_name) || normalizeOptional(nameParts[0]),
          lastName: normalizeOptional(googleProfile.family_name) || normalizeOptional(nameParts.slice(1).join(" ")),
        },
        create: {
          email,
          googleId: googleProfile.sub,
          emailVerified: true,
          authProvider: "google",
          firstName: normalizeOptional(googleProfile.given_name) || normalizeOptional(nameParts[0]),
          lastName: normalizeOptional(googleProfile.family_name) || normalizeOptional(nameParts.slice(1).join(" ")),
          passwordHash,
        },
      });

      return { token: signToken(user), user };
    },

    updateProfile: async (root, { input }, { prisma, user }) => {
      if (!user) throw new Error("Login required.");

      return prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: normalizeOptional(input.firstName),
          lastName: normalizeOptional(input.lastName),
          phone: normalizeOptional(input.phone),
        },
      });
    },

    addAddress: async (root, { input }, { prisma, user }) => {
      if (!user) throw new Error("Login required.");

      if (input.isDefault) {
        await prisma.address.updateMany({
          where: { userId: user.id },
          data: { isDefault: false },
        });
      }

      return prisma.address.create({
        data: {
          userId: user.id,
          fullName: input.fullName,
          phone: input.phone,
          address1: input.address1,
          address2: input.address2,
          city: input.city,
          province: input.province,
          postalCode: input.postalCode,
          country: input.country || "Pakistan",
          isDefault: Boolean(input.isDefault),
        },
      });
    },

    saveDefaultAddress: async (root, { input }, { prisma, user }) => {
      if (!user) throw new Error("Login required.");

      await prisma.address.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });

      const existingAddress = await prisma.address.findFirst({
        where: { userId: user.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });

      const data = {
        userId: user.id,
        fullName: input.fullName,
        phone: input.phone,
        address1: input.address1,
        address2: input.address2,
        city: input.city,
        province: input.province,
        postalCode: input.postalCode,
        country: input.country || "Pakistan",
        isDefault: true,
      };

      if (existingAddress) {
        return prisma.address.update({
          where: { id: existingAddress.id },
          data,
        });
      }

      return prisma.address.create({ data });
    },

    addToCart: async (root, args, { prisma, user }) => {
      const where = getCartWhere(user, args.sessionId);
      let cart = await prisma.cart.findFirst({ where });

      if (!cart) {
        cart = await prisma.cart.create({
          data: {
            userId: user ? user.id : null,
            sessionId: user ? null : args.sessionId,
          },
        });
      }

      const product = await prisma.product.findUnique({ where: { id: args.productId } });
      if (!product) throw new Error("Product not found.");
      const discountedPrice = Math.round(product.price - (product.price * (product.discount || 0)) / 100);

      await prisma.cartItem.upsert({
        where: {
          cartId_productId_variantId: {
            cartId: cart.id,
            productId: args.productId,
            variantId: args.variantId || "",
          },
        },
        update: {
          quantity: { increment: args.quantity },
          price: discountedPrice,
        },
        create: {
          cartId: cart.id,
          productId: args.productId,
          variantId: args.variantId || "",
          quantity: args.quantity,
          price: discountedPrice,
        },
      });

      const updatedCart = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartInclude });
      return toCartGraph(updatedCart);
    },

    updateCartItem: async (root, args, { prisma }) => {
      const currentItem = await prisma.cartItem.findUnique({ where: { id: args.cartItemId } });
      if (!currentItem) throw new Error("Cart item not found.");

      if (args.quantity <= 0) {
        await prisma.cartItem.delete({ where: { id: args.cartItemId } });
      } else {
        await prisma.cartItem.update({
          where: { id: args.cartItemId },
          data: { quantity: args.quantity },
        });
      }

      const cart = await prisma.cart.findUnique({ where: { id: currentItem.cartId }, include: cartInclude });
      return toCartGraph(cart);
    },

    removeCartItem: async (root, args, { prisma }) => {
      const currentItem = await prisma.cartItem.findUnique({ where: { id: args.cartItemId } });
      if (!currentItem) throw new Error("Cart item not found.");

      await prisma.cartItem.delete({ where: { id: args.cartItemId } });
      const cart = await prisma.cart.findUnique({ where: { id: currentItem.cartId }, include: cartInclude });
      return toCartGraph(cart);
    },

    clearCart: async (root, args, { prisma, user }) => {
      const where = getCartWhere(user, args.sessionId);
      const cart = await prisma.cart.findFirst({ where });
      if (!cart) return null;

      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      const updatedCart = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartInclude });
      return toCartGraph(updatedCart);
    },

    createOrder: async (root, { input }, { prisma, user }) => {
      const products = await prisma.product.findMany({
        where: { id: { in: input.items.map((item) => item.productId) } },
        include: { images: { orderBy: { sortOrder: "asc" } }, variants: true },
      });

      const productMap = new Map(products.map((product) => [product.id, product]));
      const items = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found.`);
        const quantity = Math.max(1, item.quantity);
        const variant = product.variants.find((productVariant) => productVariant.variantId === item.variantId);
        const discountedPrice = Math.round(product.price - (product.price * (product.discount || 0)) / 100);

        return {
          productId: product.id,
          variantId: item.variantId || null,
          variantSize: variant?.size || null,
          productTitle: product.title,
          imageSrc: product.images[0] ? product.images[0].src : null,
          quantity,
          unitPrice: discountedPrice,
          total: discountedPrice * quantity,
        };
      });
      const subtotal = items.reduce((sum, item) => sum + item.total, 0);

      return prisma.order.create({
        data: {
          orderNumber: createOrderNumber(),
          userId: user ? user.id : null,
          customerName: input.customerName,
          email: input.email,
          phone: input.phone,
          address1: input.address1,
          address2: input.address2,
          city: input.city,
          province: input.province,
          postalCode: input.postalCode,
          country: input.country || "Pakistan",
          subtotal,
          total: subtotal,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          items: {
            create: items,
          },
        },
        include: orderInclude,
      });
    },

    createReview: (root, { input }, { prisma, user }) =>
      prisma.review.create({
        data: {
          productId: input.productId,
          userId: user ? user.id : null,
          name: input.name,
          email: input.email,
          rating: input.rating,
          title: input.title,
          comment: input.comment,
          status: "APPROVED",
        },
      }),

    createMadeToOrderRequest: (root, { input }, { prisma, user }) =>
      prisma.madeToOrderRequest.create({
        data: {
          userId: user ? user.id : null,
          fabricId: input.fabricId || null,
          customerName: input.customerName,
          phone: input.phone,
          email: input.email,
          category: input.category,
          color: input.color,
          fit: input.fit,
          eventDate: input.eventDate ? new Date(input.eventDate) : null,
          city: input.city,
          measurements: parseMeasurements(input.measurements),
          embroidery: input.embroidery,
          budget: input.budget,
          instructions: input.instructions,
        },
        include: { fabric: { include: { images: true } } },
      }),
  },

  Product: {
    reviews: (parent, args, { prisma }) =>
      prisma.review.findMany({
        where: { productId: parent.id, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
      }),
  },
  User: {
    addresses: (parent, args, { prisma }) =>
      prisma.address.findMany({
        where: { userId: parent.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      }),
  },
  OrderItem: {
    product: (parent) => toProductGraph(parent.product),
  },
};

module.exports = resolvers;
