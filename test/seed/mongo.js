// Seed data for the MongoDB test container.
// Runs in the database named by MONGO_INITDB_DATABASE (tabledock_test).
db.users.insertMany([
  { email: 'alice@example.com', name: 'Alice', active: true, age: 30 },
  { email: 'bob@example.com', name: 'Bob', active: true, age: 25 },
  { email: 'carol@example.com', name: 'Carol', active: false, age: 41 }
])
db.users.createIndex({ email: 1 }, { unique: true })
