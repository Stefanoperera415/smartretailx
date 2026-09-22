const warehouseRepository = require("../repositories/warehouseRepository");
const inventoryRepository = require("../repositories/inventoryRepository");

// GET /api/v1/warehouses
async function getWarehouses(req, res, next) {
  try {
    const warehouses = await warehouseRepository.findAll();
    return res.status(200).json({ data: warehouses });
  } catch (error) {
    next(error);
  }
}

// GET /api/v1/warehouses/:warehouseId
async function getWarehouseById(req, res, next) {
  try {
    const warehouse = await warehouseRepository.findById(req.params.warehouseId);
    if (!warehouse) {
      return res.status(404).json({ error: "Warehouse not found" });
    }
    return res.status(200).json({ data: warehouse });
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/warehouses
async function createWarehouse(req, res, next) {
  try {
    const { name, location, status = "ACTIVE" } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // Check duplicate name
    const all = await warehouseRepository.findAll();
    if (all.some(w => w.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: "Warehouse with this name already exists" });
    }

    const warehouseId = `WH${Date.now()}`;
    const newWarehouse = { warehouseId, name: name.trim(), location: location?.trim() || "", status };
    const created = await warehouseRepository.create(newWarehouse);
    return res.status(201).json({ data: created });
  } catch (error) {
    next(error);
  }
}

// PUT /api/v1/warehouses/:warehouseId
async function updateWarehouse(req, res, next) {
  try {
    const warehouseId = req.params.warehouseId;
    const existing = await warehouseRepository.findById(warehouseId);
    if (!existing) {
      return res.status(404).json({ error: "Warehouse not found" });
    }

    const { name, location, status } = req.body;
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      if (name.trim().toLowerCase() !== existing.name.toLowerCase()) {
        const all = await warehouseRepository.findAll();
        if (all.some(w => w.name.toLowerCase() === name.trim().toLowerCase() && w.warehouseId !== warehouseId)) {
          return res.status(409).json({ error: "Warehouse with this name already exists" });
        }
      }
      updates.name = name.trim();
    }
    if (location !== undefined) {
      updates.location = location.trim() || "";
    }
    if (status !== undefined) {
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        return res.status(400).json({ error: "status must be ACTIVE or INACTIVE" });
      }
      updates.status = status;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const updated = await warehouseRepository.update(warehouseId, updates);
    return res.status(200).json({ data: updated });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/v1/warehouses/:warehouseId
async function deleteWarehouse(req, res, next) {
  try {
    const warehouseId = req.params.warehouseId;
    const existing = await warehouseRepository.findById(warehouseId);
    if (!existing) {
      return res.status(404).json({ error: "Warehouse not found" });
    }

    // Check if any inventory exists for this warehouse
    const allInventory = await inventoryRepository.findAll();
    const inUse = allInventory.some(inv => inv.warehouseId === warehouseId);
    if (inUse) {
      return res.status(409).json({ error: "Cannot delete warehouse because it has inventory records" });
    }

    const deleted = await warehouseRepository.remove(warehouseId);
    if (!deleted) {
      return res.status(404).json({ error: "Warehouse not found" });
    }
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};