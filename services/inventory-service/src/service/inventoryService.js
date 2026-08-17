const Inventory = require("../models/inventory");

async function reserveStock(productId, warehouseId, quantity) {
  const numericQuantity = Number(quantity);

  if (
    !productId ||
    !warehouseId ||
    !Number.isInteger(numericQuantity) ||
    numericQuantity <= 0
  ) {
    throw new Error(
      `Invalid inventory reservation: productId=${productId}, warehouseId=${warehouseId}, quantity=${quantity}`
    );
  }

  const inventory = await Inventory.findOneAndUpdate(
    {
      productId: String(productId),
      warehouseId: String(warehouseId),

      $expr: {
        $gte: [
          {
            $subtract: [
              "$quantity",
              {
                $ifNull: ["$reservedQuantity", 0]
              }
            ]
          },
          numericQuantity
        ]
      }
    },
    {
      $inc: {
        reservedQuantity: numericQuantity
      }
    },
    {
      returnDocument: "after"
    }
  );

  return inventory;
}

async function releaseStock(
  productId,
  warehouseId,
  quantity
) {
  const numericQuantity = Number(quantity);

  if (
    !productId ||
    !warehouseId ||
    !Number.isInteger(numericQuantity) ||
    numericQuantity <= 0
  ) {
    throw new Error(
      `Invalid inventory release: productId=${productId}, warehouseId=${warehouseId}, quantity=${quantity}`
    );
  }

  return Inventory.findOneAndUpdate(
    {
      productId: String(productId),
      warehouseId: String(warehouseId),
      reservedQuantity: {
        $gte: numericQuantity
      }
    },
    {
      $inc: {
        reservedQuantity: -numericQuantity
      }
    },
    {
      returnDocument: "after"
    }
  );
}

module.exports = {
  reserveStock,
  releaseStock
};