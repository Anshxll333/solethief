import { useMemo, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useCommerce } from '../commerce/context.js';
import { CatalogCard, CatalogState } from '../commerce/CommerceUI';
import { Flame, Search, ChevronDown, X, SlidersHorizontal } from 'lucide-react';
import './NewDrops.css';

export default function NewDrops() {
  const { catalog } = useCommerce();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('newest');

  const products = catalog?.products || [];

  const filteredDrops = useMemo(() => {
    let result = products.slice();

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.dropBatch && p.dropBatch.toLowerCase().includes(q))
      );
    }

    if (sortOption === 'price-asc') {
      result.sort((a, b) => (a.priceMinor || 0) - (b.priceMinor || 0));
    } else if (sortOption === 'price-desc') {
      result.sort((a, b) => (b.priceMinor || 0) - (a.priceMinor || 0));
    } else if (sortOption === 'newest') {
      result.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    }

    return result;
  }, [products, searchQuery, sortOption]);

  return (
    <div className="pageContainer">
      <Navbar />
      <main className="newDropsPage">
        <header className="dropsHero">
          <div className="dropsVaultBadge">
            <span className="dropsLivePulse" aria-hidden="true" />
            <span>AUTHENTIC DROPS • PAN-INDIA DISPATCH</span>
          </div>
          <h1 className="dropsTitle">THE ARCHIVE DROP</h1>
          <p className="dropsSubtitle">
            Rare kicks. Zero fakes. Claim your next grail before it's gone forever.
          </p>
        </header>

        <section className="dropsToolbar" aria-label="Drop search and sorting">
          <div className="dropsControls">
            <div className="dropsSearchWrapper">
              <Search size={15} className="dropsSearchIcon" aria-hidden="true" />
              <input
                type="search"
                className="dropsSearchInput"
                placeholder="SEARCH DROPS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search sneaker drops"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="dropsClearSearch"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="dropsSortWrapper">
              <SlidersHorizontal size={14} className="dropsSortIcon" aria-hidden="true" />
              <select
                className="dropsSortSelect"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                aria-label="Sort sneaker drops"
              >
                <option value="newest">SORT BY</option>
                <option value="price-asc">PRICE: LOW TO HIGH</option>
                <option value="price-desc">PRICE: HIGH TO LOW</option>
              </select>
              <ChevronDown size={14} className="dropsSortChevron" aria-hidden="true" />
            </div>
          </div>
        </section>

        {catalog.status === 'loading' && <CatalogState />}
        {catalog.status === 'error' && <CatalogState />}

        {catalog.status === 'ready' && (
          <section className="dropsGrid" aria-label="Sneaker drop allocations">
            {filteredDrops.length > 0 ? (
              filteredDrops.map((product) => (
                <CatalogCard key={product.id} product={product} />
              ))
            ) : (
              <div className="dropsEmptyState" role="status">
                <Flame size={32} style={{ color: '#bc2828', marginBottom: '0.75rem' }} />
                <h3>No drops found</h3>
                <p>No sneaker drops match your search query. Try adjusting your search.</p>
                {searchQuery && (
                  <button
                    type="button"
                    className="dropsResetBtn"
                    onClick={() => setSearchQuery('')}
                  >
                    Clear Search
                  </button>
                )}
              </div>
            )}
          </section>
        )}

      </main>
      <Footer />
    </div>
  );
}
