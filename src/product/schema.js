const typeDefs = `
  type Product {
    id: Int!
    title: String
    description: String
    type: _CategoryType
    brand: String
    collection: [String]
    category: String
    price: String
    sale: String
    discount: String
    rating: Float
    picture: Int
    stock: Int
    new: String
    tags: [String]
    variants: [Variants]
    images: [Images]
    reviews: [Review]
    sortBy: _SortBy
  }

  type Images {
    image_id: Int
    id: String
    alt: String
    src: String
  }

  type Variants {
    variant_id: String
    id: String
    sku: String
    size: String
    color: String
    image_id: Int
  }

  type Currency {
    currency: String
    name: String
    symbol: String
    value: Int
  }

  type User {
    id: ID!
    firstName: String
    lastName: String
    email: String!
    phone: String
    isAdmin: Boolean
    addresses: [Address]
    createdAt: String
  }

  type Address {
    id: ID!
    fullName: String
    phone: String
    address1: String
    address2: String
    city: String
    province: String
    postalCode: String
    country: String
    isDefault: Boolean
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Cart {
    id: ID!
    userId: String
    sessionId: String
    items: [CartItem]
    subtotal: Int
    totalItems: Int
  }

  type CartItem {
    id: ID!
    product: Product
    productId: Int
    variantId: String
    quantity: Int
    price: Int
    total: Int
  }

  type Order {
    id: ID!
    orderNumber: String
    customerName: String
    email: String
    phone: String
    address1: String
    address2: String
    city: String
    province: String
    postalCode: String
    country: String
    subtotal: Int
    shippingTotal: Int
    discountTotal: Int
    total: Int
    status: String
    paymentStatus: String
    paymentMethod: String
    notes: String
    items: [OrderItem]
    createdAt: String
  }

  type OrderItem {
    id: ID!
    product: Product
    productId: Int
    variantId: String
    productTitle: String
    imageSrc: String
    quantity: Int
    unitPrice: Int
    total: Int
  }

  type Review {
    id: ID!
    productId: Int
    userId: String
    name: String
    email: String
    rating: Float
    title: String
    comment: String
    status: String
    createdAt: String
  }

  type Fabric {
    id: ID!
    name: String
    description: String
    images: [FabricImage]
  }

  type FabricImage {
    id: ID!
    src: String
    alt: String
    sortOrder: Int
  }

  type MadeToOrderRequest {
    id: ID!
    customerName: String
    phone: String
    email: String
    category: String
    color: String
    fit: String
    eventDate: String
    city: String
    embroidery: String
    budget: String
    instructions: String
    status: String
    fabric: Fabric
    createdAt: String
  }

  type Instagram {
    type: String
    img: String
  }

  type Brand {
    brand: [String]
  }

  type Color {
    colors: [String]
  }

  type Size {
    size: [String]
  }

  enum _SortBy {
    HighToLow
    LowToHigh
    Newest
    AscOrder
    DescOrder
  }

  enum _CategoryType {
    electronics
    vegetables
    furniture
    jewellery
    fashion
    beauty
    flower
    tools
    watch
    metro
    shoes
    bags
    kids
    game
    gym
    pets
    portfolio
    goggles
    videoslider
    marijuana
    nursery
    christmas
    marketplace
    light
    all
  }

  type ProductResponse {
    items: [Product]
    total: Int
    hasMore: Boolean
  }

  type Blog {
    type: String
    img: String
    link: String
    title: String
    desc: String
    date: String
    shortDesc: String
    longDesc: String
  }

  input RegisterInput {
    firstName: String
    lastName: String
    email: String!
    phone: String
    password: String!
  }

  input AddressInput {
    fullName: String
    phone: String
    address1: String!
    address2: String
    city: String!
    province: String
    postalCode: String
    country: String
    isDefault: Boolean
  }

  input CartItemInput {
    productId: Int!
    variantId: String
    quantity: Int!
  }

  input CheckoutInput {
    customerName: String!
    email: String
    phone: String!
    address1: String!
    address2: String
    city: String!
    province: String
    postalCode: String
    country: String
    paymentMethod: String
    notes: String
    items: [CartItemInput!]!
  }

  input ReviewInput {
    productId: Int!
    name: String!
    email: String
    rating: Float!
    title: String
    comment: String!
  }

  input MadeToOrderInput {
    customerName: String!
    phone: String!
    email: String
    category: String!
    fabricId: String
    color: String!
    fit: String
    eventDate: String
    city: String
    measurements: String
    embroidery: String
    budget: String
    instructions: String
  }

  type Query {
    me: User
    product(id: Int!): Product
    products(indexFrom: Int, limit: Int, type: _CategoryType, text: String, brand: [String!], size: [String!], color: String, sortBy: _SortBy, priceMin: Int, priceMax: Int): ProductResponse
    productByType(type: String): [Product]
    productByCategory(category: String): [Product]
    cart(sessionId: String): Cart
    myOrders: [Order]
    order(id: ID!): Order
    productReviews(productId: Int!): [Review]
    fabrics: [Fabric]
    madeToOrderRequests: [MadeToOrderRequest]
    instagram(type: String): [Instagram]
    blog(type: String): [Blog]
    getBrands(type: String): Brand!
    getColors(type: String): Color!
    getSize(type: String): Size!
    newProducts(type: String): [Product]
    getProducts(limit: Int): [Product]
    getCurrency: [Currency]
  }

  type Mutation {
    register(input: RegisterInput!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    addAddress(input: AddressInput!): Address!
    addToCart(sessionId: String, productId: Int!, variantId: String, quantity: Int!): Cart!
    updateCartItem(cartItemId: ID!, quantity: Int!): Cart!
    removeCartItem(cartItemId: ID!): Cart!
    clearCart(sessionId: String): Cart!
    createOrder(input: CheckoutInput!): Order!
    createReview(input: ReviewInput!): Review!
    createMadeToOrderRequest(input: MadeToOrderInput!): MadeToOrderRequest!
  }
`;

module.exports = typeDefs;
