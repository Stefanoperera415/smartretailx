const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      index: true
    },

    warehouseId: {
      type: String,
      required: true,
      index: true
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    reservedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    reorderLevel: {
      type: Number,
      required: true,
      min: 0,
      default: 10
    }
  },
  {
    timestamps: true
  }
);

inventorySchema.virtual("availableQuantity").get(function () {
  return this.quantity - this.reservedQuantity;
});

inventorySchema.set("toJSON", {
  virtuals: true
});

inventorySchema.index(
  { productId: 1, warehouseId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Inventory", inventorySchema);