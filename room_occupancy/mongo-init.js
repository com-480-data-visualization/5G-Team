db = db.getSiblingDB("appdb");

db.createUser({
  user: "5gteam-admin",
  pwd: "reeeeeee",
  roles: [
    { role: "readWrite", db: "appdb" }
  ]
});

db.items.insertMany([
    { name: "bc010", day: "2026-01-01", events: [] },
    { name: "bc133", day: "2026-01-01", events: [] },
]);
