const inventoryRepo = require("../repositories/inventoryRepository");

async function getInventory(req, res) {
  try {
    const { productId } = req.params;
    const items = await inventoryRepo.findByProductId(productId);
    if (items.length === 0) {
      return res.status(404).json({ error: "Inventory not found for product" });
    }
    return res.status(200).json({ data: items });
  } catch (error) {
    console.error("Get inventory error:", error);
    return res.status(500).json({ error: "Failed to retrieve inventory" });
  }
}

async function getAllInventory(req, res) {
  try {
    const items = await inventoryRepo.findAll(); // we need to add this method
    return res.status(200).json({ data: items });
  } catch (error) {
    console.error("Get all inventory error:", error);
    return res.status(500).json({ error: "Failed to retrieve inventory" });
  }
}

async function getInventoryByWarehouse(req, res) {
  try {
    const { productId, warehouseId } = req.params;
    const item = await inventoryRepo.findOne(productId, warehouseId);
    if (!item) {
      return res.status(404).json({ error: "Inventory not found" });
    }
    return res.status(200).json({ data: item });
  } catch (error) {
    console.error("Get inventory by warehouse error:", error);
    return res.status(500).json({ error: "Failed to retrieve inventory" });
  }
}

async function deleteInventory(req, res) {
  try {
    const { productId, warehouseId } = req.params;
    const deleted = await inventoryRepo.delete(productId, warehouseId);
    if (!deleted) {
      return res.status(404).json({ error: "Inventory not found" });
    }
    return res.status(204).send();
  } catch (error) {
    console.error("Delete inventory error:", error);
    return res.status(500).json({ error: "Failed to delete inventory" });
  }
}



async function updateInventory(req, res) {
  try {
    const { productId } = req.params;
    const { warehouseId, quantity, reorderLevel } = req.body;

    if (!warehouseId) {
      return res.status(400).json({ error: "warehouseId is required" });
    }

    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 0)) {
      return res.status(400).json({ error: "quantity must be a non-negative integer" });
    }

    if (reorderLevel !== undefined && (!Number.isInteger(reorderLevel) || reorderLevel < 0)) {
      return res.status(400).json({ error: "reorderLevel must be a non-negative integer" });
    }

    const current = await inventoryRepo.findOne(productId, warehouseId);
    if (current && current.reservedQuantity > (quantity || current.quantity)) {
      return res.status(409).json({ error: "Quantity cannot be lower than reserved quantity" });
    }

    const updated = await inventoryRepo.upsert(
      productId,
      warehouseId,
      quantity !== undefined ? quantity : current?.quantity || 0,
      reorderLevel !== undefined ? reorderLevel : current?.reorderLevel || 10
    );

    return res.status(200).json({ data: updated });
  } catch (error) {
    console.error("Update inventory error:", error);
    return res.status(500).json({ error: "Failed to update inventory" });
  }
}

async function reserveInventory(req, res) {
  try {
    const { productId } = req.params;
    const { warehouseId, quantity } = req.body;

    if (!warehouseId || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "warehouseId and positive integer quantity are required" });
    }

    const updated = await inventoryRepo.reserveStock(productId, warehouseId, quantity);
    if (!updated) {
      return res.status(409).json({ error: "Insufficient available inventory" });
    }
    return res.status(200).json({ message: "Inventory reserved successfully", data: updated });
  } catch (error) {
    console.error("Reserve inventory error:", error);
    return res.status(500).json({ error: "Failed to reserve inventory" });
  }
}

async function releaseInventory(req, res) {
  try {
    const { productId } = req.params;
    const { warehouseId, quantity } = req.body;

    if (!warehouseId || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "warehouseId and positive integer quantity are required" });
    }

    const updated = await inventoryRepo.releaseStock(productId, warehouseId, quantity);
    if (!updated) {
      return res.status(409).json({ error: "Unable to release requested quantity" });
    }
    return res.status(200).json({ message: "Inventory released successfully", data: updated });
  } catch (error) {
    console.error("Release inventory error:", error);
    return res.status(500).json({ error: "Failed to release inventory" });
  }
}

module.exports = {
  getInventory,
  getInventoryByWarehouse,
  getAllInventory,
  updateInventory,
  reserveInventory,
  releaseInventory,
  deleteInventory,
};