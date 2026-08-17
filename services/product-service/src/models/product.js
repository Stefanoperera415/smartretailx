const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    categoryId: {
      type: String,
      required: true,
      index: true
    },

    description: {
      type: String,
      required: true
    },

    price: {
      type: Number,
      required: true,
      min: 0
    },

    currency: {
      type: String,
      default: "GBP",
      uppercase: true
    },

    imageUrl: {
      type: String,
      default: null
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Product", productSchema);