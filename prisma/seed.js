const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const products = require("../src/product/data");
const currencies = require("../src/currency/data");
const blogs = require("../src/Blogs/data");
const instagram = require("../src/instagram/data");

const prisma = new PrismaClient();

const fabrics = Array.from({ length: 9 }, (_, index) => ({
  id: `fabric-${index + 1}`,
  name: `Fabric ${index + 1}`,
  description:
    "Premium fabric sample for made-to-order menswear. Final details, availability, and matching will be confirmed by our team.",
  image: `/assets/images/fabrics/fab${index + 1}.png`,
}));

async function seedCurrency() {
  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { currency: currency.currency },
      update: currency,
      create: currency,
    });
  }
}

async function seedProducts() {
  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        title: product.title,
        description: product.description,
        type: product.type,
        brand: product.brand,
        category: product.category,
        price: Number(product.price),
        sale: Boolean(product.sale),
        discount: Number(product.discount || 0),
        rating: Number(product.rating || 5),
        stock: Number(product.stock || 0),
        isNew: Boolean(product.new),
        tags: product.tags || [],
        collections: product.collection || [],
        isActive: true,
      },
      create: {
        id: product.id,
        title: product.title,
        description: product.description,
        type: product.type,
        brand: product.brand,
        category: product.category,
        price: Number(product.price),
        sale: Boolean(product.sale),
        discount: Number(product.discount || 0),
        rating: Number(product.rating || 5),
        stock: Number(product.stock || 0),
        isNew: Boolean(product.new),
        tags: product.tags || [],
        collections: product.collection || [],
      },
    });

    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });

    for (const image of product.images || []) {
      await prisma.productImage.create({
        data: {
          id: image.id,
          imageId: image.image_id,
          productId: product.id,
          alt: image.alt,
          src: image.src,
          sortOrder: product.images.indexOf(image),
        },
      });
    }

    for (const variant of product.variants || []) {
      await prisma.productVariant.create({
        data: {
          id: variant.id,
          variantId: variant.variant_id,
          productId: product.id,
          sku: variant.sku,
          size: variant.size,
          color: variant.color || "default",
          imageId: variant.image_id,
        },
      });
    }
  }
}

async function seedFabrics() {
  for (const fabric of fabrics) {
    await prisma.fabric.upsert({
      where: { id: fabric.id },
      update: {
        name: fabric.name,
        description: fabric.description,
        isActive: true,
      },
      create: {
        id: fabric.id,
        name: fabric.name,
        description: fabric.description,
      },
    });

    await prisma.fabricImage.deleteMany({ where: { fabricId: fabric.id } });
    await prisma.fabricImage.create({
      data: {
        fabricId: fabric.id,
        src: fabric.image,
        alt: fabric.name,
      },
    });
  }
}

async function seedContent() {
  await prisma.blog.deleteMany();
  await prisma.instagram.deleteMany();

  await prisma.blog.createMany({
    data: blogs.map((blog) => ({
      type: blog.type,
      img: blog.img,
      link: blog.link,
      title: blog.title,
      desc: blog.desc,
      date: blog.date,
      shortDesc: blog.shortDesc,
      longDesc: blog.longDesc,
    })),
  });

  await prisma.instagram.createMany({
    data: instagram.map((item) => ({
      type: item.type,
      img: item.img,
    })),
  });
}

async function seedAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isAdmin: true },
    create: {
      email,
      passwordHash,
      isAdmin: true,
      firstName: "Dream",
      lastName: "Stitch",
    },
  });
}

async function main() {
  await seedCurrency();
  await seedProducts();
  await seedFabrics();
  await seedContent();
  await seedAdminUser();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Database seeded successfully");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
