import { useEffect, useState } from "react";
import * as inventoryService from "../../services/inventoryService";
import LoadingSpinner from "../../components/LoadingSpinner";

const InventoryAdmin = () => {
  const [inventory, setInventory] = useState([]);
  const [warehouses, setWarehouses] = useState([]); // ✅ new
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ quantity: "", reorderLevel: "" });

  // Fetch inventory
  const fetchInventory = async () => {
    try {
      const res = await inventoryService.getAllInventory();
      setInventory(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Fetch warehouses for dropdown
  const fetchWarehouses = async () => {
    try {
      const res = await inventoryService.getWarehouses();
      setWarehouses(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch warehouses:", err);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchWarehouses(); // ✅ load warehouses on mount
  }, []);

  const handleEdit = (item) => {
    setEditingItem(item);
    setForm({
      quantity: item.quantity,
      reorderLevel: item.reorderLevel,
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await inventoryService.updateInventory(editingItem.productId, {
        warehouseId: editingItem.warehouseId, // keep existing warehouse
        quantity: Number(form.quantity),
        reorderLevel: Number(form.reorderLevel),
      });
      setEditingItem(null);
      fetchInventory();
    } catch (err) {
      console.error(err);
      alert("Failed to update inventory");
    }
  };

  // Helper: get warehouse name by ID
  const getWarehouseName = (warehouseId) => {
    const wh = warehouses.find((w) => w.warehouseId === warehouseId);
    return wh ? wh.name : warehouseId;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Inventory Management</h1>

      {editingItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Edit Inventory</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
                <input type="text" value={editingItem.productId} disabled className="input-field bg-gray-100" />
              </div>
              {/* ✅ Warehouse dropdown (disabled) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
                <select
                  value={editingItem.warehouseId}
                  disabled
                  className="input-field bg-gray-100"
                >
                  {warehouses.length === 0 ? (
                    <option value={editingItem.warehouseId}>
                      {editingItem.warehouseId} (no warehouses loaded)
                    </option>
                  ) : (
                    warehouses.map((wh) => (
                      <option key={wh.warehouseId} value={wh.warehouseId}>
                        {wh.name} ({wh.warehouseId})
                      </option>
                    ))
                  )}
                </select>
                <p className="text-xs text-gray-400 mt-1">Warehouse cannot be changed.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  required
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                <input
                  type="number"
                  min="0"
                  value={form.reorderLevel}
                  onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                  required
                  className="input-field"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setEditingItem(null)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">Update</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warehouse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reserved</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reorder Level</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {inventory.map((item) => (
                <tr key={`${item.productId}-${item.warehouseId}`}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">{item.productId}</td>
                  {/* ✅ Display warehouse name instead of ID */}
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                    {getWarehouseName(item.warehouseId)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{item.quantity}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{item.available}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{item.reservedQuantity}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{item.reorderLevel}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button onClick={() => handleEdit(item)} className="text-indigo-600 hover:text-indigo-900">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryAdmin;