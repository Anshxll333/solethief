import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useCommerce } from '../commerce/context.js';
import { CatalogState } from '../commerce/CommerceUI';
import { formatMoney, resolveCart, subtotalMinor } from '../commerce/cart.js';

export default function Cart() {
  const { catalog, cart, remove, clear, storageWarning } = useCommerce();
  const ready = catalog.status === 'ready';
  const lines = resolveCart(cart, catalog);
  const incomplete = lines.some(line => !line.product);
  return <div className="pageContainer"><Navbar /><main className="commercePage">
    <p className="commerceEyebrow">SOLETHIEF / YOUR SELECTION</p>
    <div className="commerceHeading"><h1>Your bag.</h1><Link className="commerceTextLink" to="/shop">Continue exploring</Link></div>
    <CatalogState />
    {storageWarning && <p role="status" className="commerceNotice">{storageWarning}</p>}
    {!cart.ids.length ? <div className="commerceState"><h2>A little room for your next story.</h2><p>Your bag is empty.</p><Link className="commerceButton" to="/shop">Explore the archive</Link></div> : <>
      <div className="commerceToolbar"><p role="status">{cart.ids.length} individual {cart.ids.length === 1 ? 'pair' : 'pairs'} in bag</p><button className="commerceTextLink" onClick={clear}>Clear bag</button></div>
      {ready && cart.source !== catalog.source && <p role="alert" className="commerceNotice">This bag belongs to a different catalog mode. These selections cannot transfer into this catalog. Remove them or clear the bag.</p>}
      <div className="commerceBagLayout"><ul className="commerceBagList">
        {lines.map(({ id, product }) => <li className="commerceBagItem" key={id}>
          {product && <Link to={`/product/${id}`}><img src={product.frontImage} alt={`${product.name}, ${product.size}`} /></Link>}
          <div>{product ? <><Link className="commerceTextLink" to={`/product/${id}`}><h2>{product.name}</h2></Link><p>{product.brand} / {product.size}</p><p>{formatMoney(product.priceMinor)}</p></> : <><h2>Pair #{id}</h2><p>{ready ? 'No longer listed or from a different catalog. Price and availability cannot be confirmed.' : 'Waiting for current catalog details. Saved prices are never used.'}</p></>}
            <p className="commerceSmall">Quantity: 1 / {catalog.source === 'preview' && product ? 'Demonstration only. Not reserved.' : 'Availability unverified. Not reserved.'}</p>
            <button className="commerceTextLink" aria-label={`Remove ${product ? product.name + ', ' + product.size : 'pair ' + id}`} onClick={() => remove(id)}>Remove</button>
          </div>
        </li>)}
      </ul><aside className="commerceSummary" aria-label="Bag estimate"><h2>{catalog.source === 'preview' ? 'Demo estimate' : 'Bag estimate'}</h2>
          <dl><div><dt>Subtotal</dt><dd>{ready && !incomplete ? formatMoney(subtotalMinor(lines)) : 'Unavailable'}</dd></div><div><dt>Shipping</dt><dd>Pending</dd></div><div><dt>Tax</dt><dd>Pending</dd></div></dl>
          <p>Shipping and 18% GST will be calculated at checkout. Bag placement does not hold or reserve pairs.</p>
          {ready && !incomplete && cart.source === catalog.source ? (
            <Link to="/checkout" className="commerceButton" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
              Proceed to Secure Checkout
            </Link>
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
