const mongoose = require("mongoose");

async function connectDatabase() {
  const mongoUrl = process.env.MONGO_URL;

  if (!mongoUrl) {
    throw new Error("MONGO_URL is not defined");
  }

  try {
    await mongoose.connect(mongoUrl);

    console.log("Connected to MongoDB");
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error.message
    );

    process.exit(1);
  }
}

module.exports = connectDatabase;