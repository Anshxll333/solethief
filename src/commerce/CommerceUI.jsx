import { Link } from 'react-router-dom';
import ShoeCard from '../components/ShoeCard';
import { useCommerce } from './context.js';
import { canAddPair, MAX_PAIRS } from './cart.js';

export function CatalogNotice() {
    return null;
}

export function CatalogState() {
    const { catalog, retry } = useCommerce();
    if (catalog.status === 'loading') return <p className="commerceState" role="status">Loading the archive...</p>;
    if (catalog.status === 'error') return <div className="commerceState" role="alert"><p>{catalog.message}</p><button className="commerceButton" onClick={retry}>Retry catalog</button></div>;
    return null;
}

export function AddToBag({ product }) {
    const { catalog, cart, add, storageWarning } = useCommerce();
    const inBag = cart.source === catalog.source && cart.ids.includes(product.id);
    const full = cart.source === catalog.source && cart.ids.length >= MAX_PAIRS;
    const enabled = catalog.status === 'ready' && canAddPair(product, catalog.source);
    return <div className="commercePurchase">
        <button type="button" className="commerceButton" disabled={!enabled || inBag || full} onClick={() => add(product.id)}
            aria-label={`${inBag ? 'Already in bag' : 'Add to bag'}: ${product.name}, ${product.size}`}>
            {inBag ? 'In your demo bag' : !enabled ? 'Availability unverified' : full ? 'Bag limit reached' : 'Add to Bag / Demo'}
        </button>
        {inBag && <Link className="commerceTextLink" to="/cart">View bag</Link>}
        <span className="commerceSmall" role="status">{inBag ? 'One individual pair in bag. This does not reserve stock.' : 'One individual pair. Quantity is limited to one.'}</span>
        {storageWarning && <span className="commerceSmall" role="status">{storageWarning}</span>}
    </div>;
}

export function CatalogCard({ product }) {
    return (
        <ShoeCard
            product={product}
            showDetailsAction
            showSize
            className="commerceCard"
        />
    );
}

export function FeaturedCatalog() {
    const { catalog } = useCommerce();
    return <><CatalogState />
        {catalog.status === 'ready' && !catalog.products.length && <p className="commerceState">No pairs are currently listed.</p>}
        <div className="featuredGrid">
            {catalog.products.slice(0, 4).map(product => (
                <ShoeCard
                    key={product.id}
                    product={product}
                    showDetailsAction
                    showSize={false}
                />
            ))}
        </div>
    </>;
}
