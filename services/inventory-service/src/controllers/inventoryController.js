const Inventory = require("../models/inventory");

async function getInventory(req, res) {
  try {
    const { productId } = req.params;

    const inventory = await Inventory.find({
      productId
    }).sort({ warehouseId: 1 });

    if (inventory.length === 0) {
      return res.status(404).json({
        error: "Inventory not found for product"
      });
    }

    return res.status(200).json({
      data: inventory
    });
  } catch (error) {
    console.error("Get inventory error:", error);

    return res.status(500).json({
      error: "Failed to retrieve inventory"
    });
  }
}

async function updateInventory(req, res) {
  try {
    const { productId } = req.params;

    const {
      warehouseId,
      quantity,
      reorderLevel
    } = req.body;

    if (!warehouseId) {
      return res.status(400).json({
        error: "warehouseId is required"
      });
    }

    if (
      quantity !== undefined &&
      (!Number.isInteger(quantity) || quantity < 0)
    ) {
      return res.status(400).json({
        error: "quantity must be a non-negative integer"
      });
    }

    if (
      reorderLevel !== undefined &&
      (!Number.isInteger(reorderLevel) || reorderLevel < 0)
    ) {
      return res.status(400).json({
        error: "reorderLevel must be a non-negative integer"
      });
    }

    const inventory = await Inventory.findOneAndUpdate(
      {
        productId,
        warehouseId
      },
      {
        ...(quantity !== undefined && { quantity }),
        ...(reorderLevel !== undefined && { reorderLevel })
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    if (inventory.reservedQuantity > inventory.quantity) {
      return res.status(409).json({
        error: "Quantity cannot be lower than reserved quantity"
      });
    }

    return res.status(200).json({
      data: inventory
    });
  } catch (error) {
    console.error("Update inventory error:", error);

    return res.status(500).json({
      error: "Failed to update inventory"
    });
  }
}

async function reserveInventory(req, res) {
  try {
    const { productId } = req.params;
    const {
      warehouseId,
      quantity
    } = req.body;

    if (!warehouseId || !Number.isInteger(quantity)) {
      return res.status(400).json({
        error: "warehouseId and integer quantity are required"
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        error: "quantity must be greater than zero"
      });
    }

    // Atomic conditional update:
    // only reserve if enough stock is available.
    const inventory = await Inventory.findOneAndUpdate(
      {
        productId,
        warehouseId,
        $expr: {
          $gte: [
            { $subtract: ["$quantity", "$reservedQuantity"] },
            quantity
          ]
        }
      },
      {
        $inc: {
          reservedQuantity: quantity
        }
      },
      {
        new: true
      }
    );

    if (!inventory) {
      return res.status(409).json({
        error: "Insufficient available inventory"
      });
    }

    return res.status(200).json({
      message: "Inventory reserved successfully",
      data: inventory
    });
  } catch (error) {
    console.error("Reserve inventory error:", error);

    return res.status(500).json({
      error: "Failed to reserve inventory"
    });
  }
}

async function releaseInventory(req, res) {
  try {
    const { productId } = req.params;

    const {
      warehouseId,
      quantity
    } = req.body;

    if (!warehouseId || !Number.isInteger(quantity)) {
      return res.status(400).json({
        error: "warehouseId and integer quantity are required"
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        error: "quantity must be greater than zero"
      });
    }

    const inventory = await Inventory.findOneAndUpdate(
      {
        productId,
        warehouseId,
        reservedQuantity: {
          $gte: quantity
        }
      },
      {
        $inc: {
          reservedQuantity: -quantity
        }
      },
      {
        new: true
      }
    );

    if (!inventory) {
      return res.status(409).json({
        error: "Unable to release requested quantity"
      });
    }

    return res.status(200).json({
      message: "Inventory released successfully",
      data: inventory
    });
  } catch (error) {
    console.error("Release inventory error:", error);

    return res.status(500).json({
      error: "Failed to release inventory"
    });
  }
}

module.exports = {
  getInventory,
  updateInventory,
  reserveInventory,
  releaseInventory
};