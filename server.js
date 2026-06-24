const { ApolloServer } = require('apollo-server')
const typeDefs = require('./src/product/schema')
const resolvers = require('./src/product/resolver')
const prisma = require('./src/db/prisma')
const { getUserFromRequest } = require('./src/auth')

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
  playground: true,
  context: async ({ req }) => ({
    prisma,
    user: await getUserFromRequest(req, prisma),
  }),
})

server
  .listen({ port: process.env.PORT || 4000 })
  .then(({ url }) => console.log('Server is running on localhost:4000', url))
