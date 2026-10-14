import { useEffect, useMemo, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useCommerce } from '../commerce/context.js';
import { CatalogCard, CatalogState } from '../commerce/CommerceUI';
import {
  Flame,
  Search,
  ChevronDown,
  X,
  SlidersHorizontal,
  BellRing,
  Timer,
  ShieldCheck,
} from 'lucide-react';
import {
  getNewDropsSettings,
  subscribeNewDropsSettings,
} from '../services/newDropsSettings.js';
import './NewDrops.css';

export default function NewDrops() {
  const { catalog } = useCommerce();
  const [settings, setSettings] = useState(() => getNewDropsSettings());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('newest');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    return subscribeNewDropsSettings((updated) => {
      setSettings(updated);
    });
  }, []);

  useEffect(() => {
    if (!settings.showCountdown || !settings.countdownTarget) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [settings.showCountdown, settings.countdownTarget]);

  const countdownTime = useMemo(() => {
    if (!settings.showCountdown || !settings.countdownTarget) return null;
    const target = new Date(settings.countdownTarget).getTime();
    if (isNaN(target)) return null;
    const diff = Math.max(0, target - now);

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    return {
      days: String(days).padStart(2, '0'),
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
      isEnded: diff === 0,
    };
  }, [settings.showCountdown, settings.countdownTarget, now]);

  const filteredDrops = useMemo(() => {
    const products = catalog?.products || [];
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
  }, [catalog.products, searchQuery, sortOption]);

  return (
    <div className="pageContainer">
      <Navbar />
      <main className="newDropsPage">
        {settings.showAnnouncement && settings.announcement && (
          <aside className="dropsAnnouncementBar" role="region" aria-label="Announcement">
            <span className="dropsAnnouncementTag">ALERT</span>
            <BellRing size={14} aria-hidden="true" />
            <span>{settings.announcement}</span>
          </aside>
        )}

        <header className="dropsHero">
          <div className="dropsVaultBadge">
            <span className="dropsLivePulse" aria-hidden="true" />
            <span>{(settings.badge || 'AUTHENTIC DROPS').replace(/\s*•\s*PAN-INDIA DISPATCH/i, '').trim() || 'AUTHENTIC DROPS'}</span>
          </div>

          <h1 className="dropsTitle">{settings.title || 'THE ARCHIVE DROP'}</h1>
          <p className="dropsSubtitle">
            {settings.subtitle || "Fresh silhouettes, restocked deadstock, and high-demand grails dispatched with express speed."}
          </p>

          {settings.showNotice && settings.featuredNotice && (
            <div className="dropsNoticeBox" role="note">
              <ShieldCheck size={15} aria-hidden="true" />
              <span>{settings.featuredNotice}</span>
            </div>
          )}

          {settings.showCountdown && countdownTime && (
            <div className="dropsCountdownWrapper" role="timer" aria-label="Drop Countdown Timer">
              <div className="dropsCountdownHeader">
                <Timer size={16} aria-hidden="true" />
                <span>{settings.countdownLabel || 'NEXT DROP WAVE DROPPING IN'}</span>
              </div>
              <div className="dropsCountdownClock">
                <div className="dropsCountdownBlock">
                  <span className="dropsCountdownNumber">{countdownTime.days}</span>
                  <span className="dropsCountdownUnit">DAYS</span>
                </div>
                <span className="dropsCountdownColon">:</span>
                <div className="dropsCountdownBlock">
                  <span className="dropsCountdownNumber">{countdownTime.hours}</span>
                  <span className="dropsCountdownUnit">HRS</span>
                </div>
                <span className="dropsCountdownColon">:</span>
                <div className="dropsCountdownBlock">
                  <span className="dropsCountdownNumber">{countdownTime.minutes}</span>
                  <span className="dropsCountdownUnit">MIN</span>
                </div>
                <span className="dropsCountdownColon">:</span>
                <div className="dropsCountdownBlock">
                  <span className="dropsCountdownNumber">{countdownTime.seconds}</span>
                  <span className="dropsCountdownUnit">SEC</span>
                </div>
              </div>
            </div>
          )}
        </header>

        <section className="dropsToolbar" aria-label="Drop search and sorting">
          <div className="dropsControls">
            <div className="dropsSearchWrapper">
              <Search size={14} className="dropsSearchIcon" aria-hidden="true" />
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
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="dropsSortWrapper">
              <SlidersHorizontal size={13} className="dropsSortIcon" aria-hidden="true" />
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
              <ChevronDown size={13} className="dropsSortChevron" aria-hidden="true" />
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
