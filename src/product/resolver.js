const bcrypt = require("bcryptjs");
const { signToken } = require("../auth");

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
      product: productInclude,
    },
  },
};

const orderInclude = {
  items: {
    include: {
      product: productInclude,
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
      const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
      if (existingUser) throw new Error("An account with this email already exists.");

      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await prisma.user.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          passwordHash,
        },
      });

      return { token: signToken(user), user };
    },

    login: async (root, { email, password }, { prisma }) => {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new Error("Invalid email or password.");

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) throw new Error("Invalid email or password.");

      return { token: signToken(user), user };
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
          price: product.price,
        },
        create: {
          cartId: cart.id,
          productId: args.productId,
          variantId: args.variantId || "",
          quantity: args.quantity,
          price: product.price,
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
        include: { images: { orderBy: { sortOrder: "asc" } } },
      });

      const productMap = new Map(products.map((product) => [product.id, product]));
      const items = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found.`);
        const quantity = Math.max(1, item.quantity);

        return {
          productId: product.id,
          variantId: item.variantId || null,
          productTitle: product.title,
          imageSrc: product.images[0] ? product.images[0].src : null,
          quantity,
          unitPrice: product.price,
          total: product.price * quantity,
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
