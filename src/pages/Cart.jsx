import { Link, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useCommerce } from '../commerce/context.js';
import { useAuth } from '../auth/authContext.js';
import { CatalogState } from '../commerce/CommerceUI';
import { formatMoney, resolveCart, subtotalMinor } from '../commerce/cart.js';

export default function Cart() {
  const navigate = useNavigate();
  const { catalog, cart, remove, clear, updateQuantity, storageWarning } = useCommerce();
  const { user, authStatus } = useAuth();
  const isAuthenticated = Boolean(user && authStatus === 'authenticated');
  const ready = catalog.status === 'ready';
  const lines = resolveCart(cart, catalog);
  const incomplete = lines.some(line => !line.product);
  const totalQuantity = lines.reduce((sum, line) => sum + (line.quantity || 1), 0);
  return <div className="pageContainer"><Navbar /><main className="commercePage">
    <p className="commerceEyebrow">SOLETHIEF / YOUR SELECTION</p>
    <div className="commerceHeading">
      <h1>Your bag.</h1>
      <div className="commerceHeadingActions">
        <Link className="commerceTextLink" to="/shop">Continue exploring</Link>
        {Boolean(cart.ids.length) && (
          <button type="button" className="commerceTextLink" onClick={clear}>Clear bag</button>
        )}
      </div>
    </div>
    <CatalogState />
    {storageWarning && <p role="status" className="commerceNotice">{storageWarning}</p>}
    {!cart.ids.length ? <div className="commerceState"><h2>A little room for your next story.</h2><p>Your bag is empty.</p><Link className="commerceButton" to="/shop">Explore the archive</Link></div> : <>
      <div className="commerceToolbar"><p role="status">{totalQuantity} {totalQuantity === 1 ? 'pair' : 'pairs'} ({cart.ids.length} {cart.ids.length === 1 ? 'silhouette' : 'silhouettes'}) in bag</p></div>
      {ready && cart.source !== catalog.source && <p role="alert" className="commerceNotice">This bag belongs to a different catalog mode. These selections cannot transfer into this catalog. Remove them or clear the bag.</p>}
      <div className="commerceBagLayout"><ul className="commerceBagList">
        {lines.map(({ id, lineId, product, size, quantity }) => {
          const itemKey = lineId || (size ? `${id}:${size}` : String(id));
          const displaySize = size || product?.size;
          const targetProductId = product?.id ?? id;
          return (
            <li className="commerceBagItem" key={itemKey}>
              {product && <Link to={`/product/${targetProductId}`} className="commerceBagThumb"><img src={product.frontImage} alt={`${product.name}, ${displaySize || ''}`} /></Link>}
              <div className="commerceBagDetails">{product ? <>
                <Link className="commerceTextLink commerceBagTitle" to={`/product/${targetProductId}`}><h2>{product.name}</h2></Link>
                <p className="commerceBagMeta">
                  {product.brand} {displaySize ? <>• <strong>Size: {displaySize}</strong></> : ''}
                </p>
                <p className="commerceBagPrice">{formatMoney(product.priceMinor)}</p>
              </> : <><h2>Pair #{id}</h2><p>{ready ? 'No longer listed or from a different catalog. Price and availability cannot be confirmed.' : 'Waiting for current catalog details. Saved prices are never used.'}</p></>}
                <div className="commerceBagActions">
                  <div className="commerceQuantityControls">
                    <span className="commerceSmall">Quantity:</span>
                    <button
                      type="button"
                      className="commerceQuantityBtn"
                      disabled={quantity <= 1}
                      onClick={() => updateQuantity(itemKey, Math.max(1, (quantity || 1) - 1))}
                      aria-label={`Decrease quantity for ${product ? product.name + ' size ' + displaySize : 'pair ' + id}`}
                    >
                      −
                    </button>
                    <span className="commerceQuantityValue">{quantity || 1}</span>
                    <button
                      type="button"
                      className="commerceQuantityBtn"
                      onClick={() => updateQuantity(itemKey, (quantity || 1) + 1)}
                      aria-label={`Increase quantity for ${product ? product.name + ' size ' + displaySize : 'pair ' + id}`}
                    >
                      +
                    </button>
                  </div>
                  {product && (
                    <button
                      type="button"
                      className="commerceItemBuyNowBtn"
                      onClick={() => {
                        const targetUrl = `/checkout?buyItem=${encodeURIComponent(itemKey)}&size=${encodeURIComponent(displaySize || '')}&qty=${quantity || 1}`;
                        if (!isAuthenticated) {
                          navigate(`/account?return=${encodeURIComponent(targetUrl)}`);
                        } else {
                          navigate(targetUrl, {
                            state: {
                              buyItem: itemKey,
                              productId: targetProductId,
                              size: displaySize,
                              qty: quantity || 1,
                            },
                          });
                        }
                      }}
                      title={`Buy only ${product.name}${displaySize ? ' (Size: ' + displaySize + ')' : ''} right now`}
                    >
                      BUY NOW →
                    </button>
                  )}
                  <button
                    type="button"
                    className="commerceRemoveBtn"
                    aria-label={`Remove ${product ? product.name + ', size ' + displaySize : 'pair ' + id}`}
                    title="Remove from bag"
                    onClick={() => remove(itemKey)}
                  >
                    <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul><aside className="commerceSummary" aria-label="Bag estimate"><h2>{catalog.source === 'preview' ? 'Demo estimate' : 'Bag estimate'}</h2>
          <dl><div><dt>Subtotal</dt><dd>{ready && !incomplete ? formatMoney(subtotalMinor(lines)) : 'Unavailable'}</dd></div><div><dt>Shipping</dt><dd>Pending</dd></div><div><dt>Tax</dt><dd>Pending</dd></div></dl>
          <p>Shipping and 18% GST will be calculated at checkout. Bag placement does not hold or reserve pairs.</p>
          {ready && !incomplete && cart.source === catalog.source ? (
            isAuthenticated ? (
              <Link to="/checkout" className="commerceButton" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
                Proceed to Secure Checkout
              </Link>
            ) : (
              <div>
                <Link to="/account?return=/checkout" className="commerceButton" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
                  Proceed to Secure Checkout
                </Link>
                <p className="commerceSmall" style={{ marginTop: '0.65rem', textAlign: 'center', color: '#6e7687', fontSize: '0.78rem', lineHeight: 1.4 }}>
                  Sign in or create an account to proceed to checkout and secure your order history.
                </p>
              </div>
            )
          ) : (
            <button className="commerceButton" disabled aria-describedby="checkout-pending">
              {incomplete ? 'Resolve unavailable items first' : 'Checkout unavailable'}
            </button>
          )}
          <p id="checkout-pending">All prices, stock and totals must be revalidated by the server at checkout. Browser storage is never authoritative.</p>
        </aside></div>
    </>}
  </main><Footer /></div>;
}
