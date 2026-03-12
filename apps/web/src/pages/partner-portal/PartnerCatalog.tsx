import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { partnerApi, PaginatedResponse, getPartnerUser } from '../../lib/partner-api';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

interface CatalogTitle {
  id: string;
  title: string;
  subtitle: string | null;
  isbn13: string;
  coverImageUrl: string | null;
  primaryAuthorId: string | null;
  rrpZar: number;
  partnerPrice: number;
  discountPct: number;
  formats: string[];
}

interface CartItem {
  title: CatalogTitle;
  qty: number;
}

interface Branch {
  id: string;
  name: string;
}

const VAT_RATE = 0.15;

function formatZAR(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  return `R ${(isNaN(num) ? 0 : num).toFixed(2)}`;
}

export function PartnerCatalog() {
  const navigate = useNavigate();
  const user = getPartnerUser();

  // Catalog state
  const [titles, setTitles] = useState<CatalogTitle[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [customerPoNumber, setCustomerPoNumber] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [successOrder, setSuccessOrder] = useState<string | null>(null);

  // Quantity inputs per title (before adding to cart)
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const isHQ = !user?.branchId;

  const fetchCatalog = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (q.trim()) params.set('search', q.trim());
      const res = await partnerApi<PaginatedResponse<CatalogTitle>>(`/catalog?${params}`);
      setTitles(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch {
      setTitles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog(page, search);
  }, [page, fetchCatalog]);

  // Fetch branches for HQ users
  useEffect(() => {
    if (!isHQ) return;
    partnerApi<{ data: Branch[] }>('/branches')
      .then((res) => setBranches(res.data))
      .catch(() => {});
  }, [isHQ]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchCatalog(1, search);
  }

  function addToCart(title: CatalogTitle) {
    const qty = quantities[title.id] || 1;
    setCart((prev) => {
      const existing = prev.find((item) => item.title.id === title.id);
      if (existing) {
        return prev.map((item) =>
          item.title.id === title.id ? { ...item, qty: item.qty + qty } : item
        );
      }
      return [...prev, { title, qty }];
    });
    setQuantities((prev) => ({ ...prev, [title.id]: 1 }));
    setCartOpen(true);
  }

  function updateCartQty(titleId: string, qty: number) {
    if (qty < 1) {
      setCart((prev) => prev.filter((item) => item.title.id !== titleId));
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.title.id === titleId ? { ...item, qty } : item))
    );
  }

  function removeFromCart(titleId: string) {
    setCart((prev) => prev.filter((item) => item.title.id !== titleId));
  }

  const subtotal = cart.reduce((sum, item) => sum + item.title.partnerPrice * item.qty, 0);
  const vat = subtotal * VAT_RATE;
  const total = subtotal + vat;

  async function placeOrder() {
    if (cart.length === 0) return;
    setPlacing(true);
    setOrderError('');
    try {
      const body: Record<string, unknown> = {
        lines: cart.map((item) => ({
          titleId: item.title.id,
          quantity: item.qty,
        })),
        notes: notes.trim() || undefined,
        customerPoNumber: customerPoNumber.trim() || undefined,
      };
      if (isHQ && selectedBranch) {
        body.branchId = selectedBranch;
      }
      const res = await partnerApi<{ data: { id: string; number: string } }>('/orders', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSuccessOrder(res.data.number);
      setCart([]);
      setNotes('');
      setCustomerPoNumber('');
      setTimeout(() => {
        navigate(`/partner/orders/${res.data.id}`);
      }, 2500);
    } catch (err: any) {
      setOrderError(err?.message || 'Failed to place order. Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  // Success overlay
  if (successOrder) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Order Placed Successfully</h2>
          <p className="text-gray-600 mb-1">
            Your order <span className="font-semibold text-[#8B1A1A]">{successOrder}</span> has been submitted.
          </p>
          <p className="text-sm text-gray-500">Redirecting to order details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <UnsavedChangesGuard hasUnsavedChanges={cart.length > 0} message="You have items in your cart. Are you sure you want to leave? Your cart will be lost." />
      {/* Main catalog area */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Browse Catalog</h1>
          <button
            onClick={() => setCartOpen(!cartOpen)}
            className="lg:hidden relative inline-flex items-center gap-2 rounded-md bg-[#8B1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F1515] transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-5.98.572M7.5 14.25H18m-10.5 0a3 3 0 105.98.572M18 14.25a3 3 0 105.98.572M18 14.25H7.5m10.5 0l1.637-7.317c.132-.492-.226-.933-.735-.933H6.106" />
            </svg>
            Cart ({cart.reduce((s, i) => s + i.qty, 0)})
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs text-white">
                {cart.length}
              </span>
            )}
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or ISBN..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#8B1A1A] focus:outline-none focus:ring-1 focus:ring-[#8B1A1A]"
            />
            <button
              type="submit"
              className="rounded-md bg-[#8B1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F1515] transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-[#8B1A1A]" />
          </div>
        )}

        {/* No results */}
        {!loading && titles.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No titles found</p>
            <p className="text-sm mt-1">Try adjusting your search terms.</p>
          </div>
        )}

        {/* Title grid */}
        {!loading && titles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {titles.map((t) => (
              <div
                key={t.id}
                className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col"
              >
                {/* Cover image or placeholder */}
                <div className="h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
                  {t.coverImageUrl ? (
                    <img
                      src={t.coverImageUrl}
                      alt={t.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-[#8B1A1A] to-[#B8860B] flex items-center justify-center p-4">
                      <span className="text-white text-center font-semibold text-sm leading-tight">
                        {t.title}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-4 flex flex-col flex-1">
                  {/* Title & subtitle */}
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                    {t.title}
                  </h3>
                  {t.subtitle && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{t.subtitle}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">by Author</p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{t.isbn13}</p>

                  {/* Formats */}
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {t.formats.map((fmt) => (
                      <span
                        key={fmt}
                        className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>

                  {/* Pricing */}
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-xs text-gray-400 line-through">
                      {formatZAR(t.rrpZar)}
                    </span>
                    <span className="text-base font-bold text-green-700">
                      {formatZAR(t.partnerPrice)}
                    </span>
                    <span className="text-xs font-medium text-[#8B1A1A] bg-red-50 rounded px-1.5 py-0.5">
                      -{t.discountPct}%
                    </span>
                  </div>

                  {/* Add to order */}
                  <div className="mt-auto pt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={quantities[t.id] || 1}
                      onChange={(e) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [t.id]: Math.max(1, parseInt(e.target.value) || 1),
                        }))
                      }
                      className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                    />
                    <button
                      onClick={() => addToCart(t)}
                      className="flex-1 rounded-md bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800 transition-colors"
                    >
                      Add to Order
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Cart sidebar */}
      <div
        className={`${
          cartOpen ? 'fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto' : 'hidden lg:block'
        } lg:w-96 lg:flex-shrink-0`}
      >
        {/* Mobile backdrop */}
        {cartOpen && (
          <div
            className="fixed inset-0 bg-black/30 lg:hidden"
            onClick={() => setCartOpen(false)}
          />
        )}

        <div
          className={`${
            cartOpen
              ? 'fixed right-0 top-0 h-full w-full max-w-md lg:relative lg:h-auto lg:max-w-none'
              : ''
          } bg-white rounded-lg shadow border border-gray-200 p-4 flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden`}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              Your Order ({cart.reduce((s, i) => s + i.qty, 0)} items)
            </h2>
            <button
              onClick={() => setCartOpen(false)}
              className="lg:hidden text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <p className="text-gray-400 text-sm">Your cart is empty. Add titles from the catalog.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {cart.map((item) => (
                <div
                  key={item.title.id}
                  className="flex gap-3 border border-gray-100 rounded-md p-3 bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title.title}</p>
                    <p className="text-xs text-gray-500 font-mono">{item.title.isbn13}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatZAR(item.title.partnerPrice)} each
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => removeFromCart(item.title.id)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Remove
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateCartQty(item.title.id, item.qty - 1)}
                        className="h-6 w-6 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm"
                      >
                        -
                      </button>
                      <span className="text-sm font-medium w-8 text-center">{item.qty}</span>
                      <button
                        onClick={() => updateCartQty(item.title.id, item.qty + 1)}
                        className="h-6 w-6 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatZAR(item.title.partnerPrice * item.qty)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Branch selector for HQ users */}
          {isHQ && branches.length > 0 && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Delivery Branch
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-[#8B1A1A] focus:outline-none focus:ring-1 focus:ring-[#8B1A1A]"
              >
                <option value="">-- Select branch --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Purchase Order Number */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Your PO Number (optional)
            </label>
            <input
              type="text"
              value={customerPoNumber}
              onChange={(e) => setCustomerPoNumber(e.target.value)}
              maxLength={50}
              placeholder="e.g. PO-12345"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-[#8B1A1A] focus:outline-none focus:ring-1 focus:ring-[#8B1A1A]"
            />
          </div>

          {/* Delivery notes */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Delivery Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Special instructions, delivery address, etc."
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-[#8B1A1A] focus:outline-none focus:ring-1 focus:ring-[#8B1A1A] resize-none"
            />
          </div>

          {/* Totals */}
          <div className="border-t border-gray-200 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatZAR(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>VAT (15%)</span>
              <span>{formatZAR(vat)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>{formatZAR(total)}</span>
            </div>
          </div>

          {/* Error */}
          {orderError && (
            <div className="mt-3 rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              {orderError}
            </div>
          )}

          {/* Place order */}
          <button
            onClick={placeOrder}
            disabled={cart.length === 0 || placing}
            className="mt-4 w-full rounded-md bg-[#8B1A1A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#6F1515] focus:outline-none focus:ring-2 focus:ring-[#8B1A1A] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {placing ? 'Placing Order...' : 'Place Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
