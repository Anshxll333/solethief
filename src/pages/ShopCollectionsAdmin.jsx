import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Plus,
    Edit3,
    Trash2,
    Search,
    Check,
    Eye,
    EyeOff,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Layers,
    Package,
    Image as ImageIcon,
    Upload,
    Download,
    Loader2,
} from 'lucide-react';
import { shopCategoriesService, subscribeShopUpdates } from '../services/shopCategories.js';
import { downloadImageAsDataUrl } from '../services/remoteImage.js';
import { resolveCollectionArtwork } from './shopGroups.js';
import './ShopCollectionsAdmin.css';

/**
 * Detects whether a URL is a webpage link (such as Pinterest pin page or Instagram post)
 * rather than a direct image link (.jpg, .png, etc.), and returns helpful user guidance.
 */
export function detectWebpageUrlGuidance(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('data:') || trimmed.startsWith('/')) return null;

    // Pinterest webpage link (e.g. in.pinterest.com/pin/..., pinterest.com/pin/..., pin.it/...)
    const isPinterestPin = /pinterest\.[a-z.]+\/pin\//i.test(trimmed) ||
        /pin\.it\//i.test(trimmed) ||
        (/pinterest\.[a-z.]+/i.test(trimmed) && !/i\.pinimg\.com/i.test(trimmed));

    if (isPinterestPin) {
        return "This looks like a webpage link (Pinterest page). To use this image, right-click the image on Pinterest and select 'Copy image address' (e.g. i.pinimg.com/...jpg) or download it and use 'Upload from Device'.";
    }

    // Instagram webpage link (e.g. instagram.com/p/..., instagram.com/reel/...)
    const isInstagramPage = /instagram\.com\/(p|reel|tv)\//i.test(trimmed) ||
        (/instagram\.com/i.test(trimmed) && !/\.(jpe?g|png|webp|svg|gif)/i.test(trimmed));

    if (isInstagramPage) {
        return "This looks like a webpage link (Instagram page). To use this image, right-click the image and select 'Copy image address' or download it and use 'Upload from Device'.";
    }

    // Any generic webpage URL without standard image extension or direct image CDN
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const cleanPath = trimmed.split('?')[0].split('#')[0].toLowerCase();
        const hasImageExt = /\.(jpe?g|png|webp|svg|gif|avif|bmp|ico)$/i.test(cleanPath);
        const isKnownImageCdn = /i\.pinimg\.com|images\.unsplash\.com|res\.cloudinary\.com|cdn\.shopify\.com/i.test(trimmed);

        if (!hasImageExt && !isKnownImageCdn) {
            return "This looks like a webpage link instead of a direct image file. To use this image, right-click the image and select 'Copy image address' (e.g. ending in .jpg, .png) or download it and use 'Upload from Device'.";
        }
    }

    return null;
}

export default function ShopCollectionsAdmin({ onOpenCreateDrop, refreshTrigger = 0 }) {
    // Categories state (independently loaded)
    const [categories, setCategories] = useState([]);
    const [memberships, setMemberships] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [categoriesError, setCategoriesError] = useState('');
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    // Selected category for product assignment
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);

    // Modal / form state for Category CRUD
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [editingCategoryId, setEditingCategoryId] = useState(null);
    const [categoryForm, setCategoryForm] = useState({
        name: '',
        slug: '',
        image_url: '',
        display_order: 1,
        is_visible: true,
    });
    const [categoryFormErrors, setCategoryFormErrors] = useState({});
    const [savingCategory, setSavingCategory] = useState(false);
    const [brokenThumbnails, setBrokenThumbnails] = useState({});
    const [previewImageError, setPreviewImageError] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [downloadingImage, setDownloadingImage] = useState(false);
    const [downloadStatus, setDownloadStatus] = useState('');
    const [downloadSuccess, setDownloadSuccess] = useState('');
    const [downloadError, setDownloadError] = useState('');
    const fileInputRef = useRef(null);

    const urlGuidanceNote = useMemo(() => {
        return detectWebpageUrlGuidance(urlInput || categoryForm.image_url);
    }, [urlInput, categoryForm.image_url]);

    // Products picker state (separate loading and error from categories)
    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [productsError, setProductsError] = useState('');
    const [productSearchQuery, setProductSearchQuery] = useState('');
    const [assigningProductId, setAssigningProductId] = useState(null);

    // Load categories independently
    const loadCategories = useCallback(async () => {
        setCategoriesLoading(true);
        setCategoriesError('');
        try {
            const res = await shopCategoriesService.list({ admin: true });
            setCategories(res.categories || []);
            setMemberships(res.memberships || []);
        } catch (err) {
            setCategoriesError(err.message || 'Failed to load shop collections.');
        } finally {
            setCategoriesLoading(false);
        }
    }, []);

    // Load products independently for product picker
    const loadProducts = useCallback(async () => {
        setProductsLoading(true);
        setProductsError('');
        try {
            const list = await shopCategoriesService.listProducts();
            setProducts(list || []);
        } catch (err) {
            setProductsError(err.message || 'Failed to load catalog products for assignment.');
        } finally {
            setProductsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCategories();
        loadProducts();
    }, [loadCategories, loadProducts, refreshTrigger]);

    // Subscribe to shop updates (cross-tab / mutation events)
    useEffect(() => {
        const unsubscribe = subscribeShopUpdates(() => {
            loadCategories();
            loadProducts();
        });
        return () => {
            unsubscribe();
        };
    }, [loadCategories, loadProducts]);

    // When categories change, ensure selected category is valid
    useEffect(() => {
        if (categories.length > 0 && (!selectedCategoryId || !categories.some(c => c.id === selectedCategoryId))) {
            setSelectedCategoryId(categories[0].id);
        }
    }, [categories, selectedCategoryId]);

    const selectedCategory = useMemo(() => {
        return categories.find((c) => c.id === selectedCategoryId) || null;
    }, [categories, selectedCategoryId]);

    // Set of product IDs assigned to current category
    const assignedProductIds = useMemo(() => {
        if (!selectedCategoryId) return new Set();
        const set = new Set();
        memberships.forEach((m) => {
            if (String(m.category_id) === String(selectedCategoryId)) {
                set.add(m.product_id);
                set.add(String(m.product_id));
                if (!Number.isNaN(Number(m.product_id))) {
                    set.add(Number(m.product_id));
                }
            }
        });
        return set;
    }, [memberships, selectedCategoryId]);

    // Handle image file selection from local device
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setCategoryFormErrors((prev) => ({ ...prev, image: 'Please select an image file (PNG, JPG, WebP, SVG, etc.).' }));
            return;
        }

        if (file.size > 8 * 1024 * 1024) {
            setCategoryFormErrors((prev) => ({ ...prev, image: 'Image size must be less than 8MB.' }));
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result;
            if (typeof dataUrl === 'string') {
                setPreviewImageError(false);
                setCategoryForm((prev) => ({ ...prev, image_url: dataUrl }));
                setCategoryFormErrors((prev) => {
                    const next = { ...prev };
                    delete next.image;
                    delete next.form;
                    return next;
                });
            }
        };
        reader.onerror = () => {
            setCategoryFormErrors((prev) => ({ ...prev, image: 'Failed to read image from device.' }));
        };
        reader.readAsDataURL(file);
    };

    // Clear artwork image
    const handleClearImage = () => {
        setPreviewImageError(false);
        setUrlInput('');
        setDownloadingImage(false);
        setDownloadStatus('');
        setDownloadSuccess('');
        setDownloadError('');
        setCategoryForm((prev) => ({ ...prev, image_url: '' }));
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setCategoryFormErrors((prev) => {
            const next = { ...prev };
            delete next.image;
            return next;
        });
    };

    // Open category modal for creation
    const handleOpenCreateCategory = () => {
        const nextOrder = categories.reduce((max, c) => Math.max(max, c.display_order || 0), 0) + 1;
        setPreviewImageError(false);
        setUrlInput('');
        setDownloadingImage(false);
        setDownloadStatus('');
        setDownloadSuccess('');
        setDownloadError('');
        setEditingCategoryId(null);
        setCategoryForm({
            name: '',
            slug: '',
            image_url: '',
            display_order: nextOrder,
            is_visible: true,
        });
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setCategoryFormErrors({});
        setShowCategoryModal(true);
    };

    // Open category modal for editing
    const handleOpenEditCategory = (cat) => {
        setPreviewImageError(false);
        const existingUrl = cat.image_url || '';
        setUrlInput(existingUrl.startsWith('data:') ? '' : existingUrl);
        setDownloadingImage(false);
        setDownloadStatus('');
        setDownloadSuccess('');
        setDownloadError('');
        setEditingCategoryId(cat.id);
        setCategoryForm({
            name: cat.name || '',
            slug: cat.slug || '',
            image_url: existingUrl,
            display_order: cat.display_order || 1,
            is_visible: cat.is_visible !== false,
        });
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setCategoryFormErrors({});
        setShowCategoryModal(true);
    };

    // Download remote image and convert directly to persistent local Base64 data URL
    const handleDownloadRemoteImage = async (overrideUrl) => {
        const rawUrl = (overrideUrl !== undefined ? overrideUrl : urlInput).trim();
        if (!rawUrl) return;
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
            return;
        }

        setDownloadingImage(true);
        setDownloadStatus('Downloading image locally...');
        setDownloadSuccess('');
        setDownloadError('');
        setCategoryFormErrors((prev) => {
            const next = { ...prev };
            delete next.image;
            return next;
        });

        try {
            const result = await downloadImageAsDataUrl(rawUrl, {
                onStatus: (status) => setDownloadStatus(status),
            });
            if (result && result.dataUrl) {
                setCategoryForm((prev) => ({ ...prev, image_url: result.dataUrl }));
                setPreviewImageError(false);
                setDownloadSuccess('Image saved locally as Base64 data URL');
                setDownloadStatus('');
                setDownloadError('');
            } else {
                throw new Error('No valid image received from URL.');
            }
        } catch (err) {
            setDownloadError(
                err.message || 'Could not download image. Please check the URL or use "Upload from Device".'
            );
            setDownloadStatus('');
            setDownloadSuccess('');
        } finally {
            setDownloadingImage(false);
        }
    };

    // Auto-trigger download on URL paste
    const handleUrlPaste = (e) => {
        const pasted = e.clipboardData.getData('text')?.trim();
        if (pasted && (pasted.startsWith('http://') || pasted.startsWith('https://'))) {
            setUrlInput(pasted);
            setCategoryForm((prev) => ({ ...prev, image_url: pasted }));
            setTimeout(() => {
                handleDownloadRemoteImage(pasted);
            }, 60);
        }
    };

    // Save category (Create or Update)
    const handleSaveCategory = async (e) => {
        e.preventDefault();
        setCategoryFormErrors({});

        if (!categoryForm.name.trim()) {
            setCategoryFormErrors({ name: 'Collection name is required.' });
            return;
        }

        let finalImageUrl = categoryForm.image_url ? (categoryForm.image_url.trim() || null) : null;
        if (finalImageUrl && (finalImageUrl.startsWith('http://') || finalImageUrl.startsWith('https://'))) {
            setSavingCategory(true);
            setDownloadStatus('Downloading image locally before saving...');
            try {
                const downloaded = await downloadImageAsDataUrl(finalImageUrl, {
                    onStatus: (status) => setDownloadStatus(status),
                });
                if (downloaded && downloaded.dataUrl) {
                    finalImageUrl = downloaded.dataUrl;
                    setCategoryForm((prev) => ({ ...prev, image_url: finalImageUrl }));
                    setDownloadSuccess('Image saved locally as Base64 data URL');
                    setDownloadStatus('');
                }
            } catch (dlErr) {
                setSavingCategory(false);
                setDownloadStatus('');
                setDownloadError(dlErr.message || 'Failed to download and persist remote image.');
                setCategoryFormErrors((prev) => ({ ...prev, image: dlErr.message || 'Failed to download remote image.' }));
                return;
            }
        }

        const payload = {
            ...(editingCategoryId ? { id: editingCategoryId } : {}),
            name: categoryForm.name.trim(),
            slug: categoryForm.slug.trim() || undefined,
            image_url: finalImageUrl,
            display_order: Number(categoryForm.display_order) || 1,
            is_visible: Boolean(categoryForm.is_visible),
        };

        setSavingCategory(true);
        try {
            const saved = await shopCategoriesService.save(payload);
            setFeedback({
                type: 'success',
                message: `Collection "${saved.name}" ${editingCategoryId ? 'updated' : 'created'} successfully.`,
            });
            setShowCategoryModal(false);
            await loadCategories();
            setSelectedCategoryId(saved.id);
        } catch (err) {
            setCategoryFormErrors({ form: err.message || 'Failed to save collection.' });
        } finally {
            setSavingCategory(false);
        }
    };

    // Delete category with confirm
    const handleDeleteCategory = async (cat) => {
        const confirmed = window.confirm(`Are you sure you want to delete the collection "${cat.name}"? Products will not be deleted.`);
        if (!confirmed) return;

        try {
            await shopCategoriesService.remove(cat.id);
            setFeedback({
                type: 'success',
                message: `Collection "${cat.name}" deleted successfully.`,
            });
            await loadCategories();
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err.message || 'Failed to delete collection.',
            });
        }
    };

    // Toggle product assignment
    const handleToggleAssignment = async (productId) => {
        if (!selectedCategoryId) return;
        const isAssigned = assignedProductIds.has(productId);
        const nextState = !isAssigned;

        setAssigningProductId(productId);
        try {
            await shopCategoriesService.assign(selectedCategoryId, productId, nextState);
            // Synchronously update memberships with type normalization
            setMemberships((prev) => {
                const cleaned = prev.filter(
                    (m) => !(String(m.category_id) === String(selectedCategoryId) && String(m.product_id) === String(productId))
                );
                if (nextState) {
                    return [...cleaned, { category_id: selectedCategoryId, product_id: productId }];
                }
                return cleaned;
            });
            setFeedback({
                type: 'success',
                message: nextState ? 'Pair assigned to collection.' : 'Pair removed from collection.',
            });
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err.message || 'Failed to update pair assignment.',
            });
        } finally {
            setAssigningProductId(null);
        }
    };

    // Separate assigned products from available catalog products
    const assignedProducts = useMemo(() => {
        return products.filter((p) => assignedProductIds.has(p.id));
    }, [products, assignedProductIds]);

    const filteredAssignedProducts = useMemo(() => {
        if (!productSearchQuery.trim()) return assignedProducts;
        const q = productSearchQuery.toLowerCase();
        return assignedProducts.filter((p) =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.brand || '').toLowerCase().includes(q) ||
            String(p.id).includes(q)
        );
    }, [assignedProducts, productSearchQuery]);

    const filteredUnassignedProducts = useMemo(() => {
        const unassigned = products.filter((p) => !assignedProductIds.has(p.id));
        if (!productSearchQuery.trim()) return unassigned;
        const q = productSearchQuery.toLowerCase();
        return unassigned.filter((p) =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.brand || '').toLowerCase().includes(q) ||
            String(p.id).includes(q)
        );
    }, [products, assignedProductIds, productSearchQuery]);

    return (
        <div className="collectionsAdminRoot">
            {/* Feedback notifications */}
            {feedback.message && (
                <div className={`collectionsAdminAlert ${feedback.type === 'error' ? 'isError' : 'isSuccess'}`} role="status">
                    {feedback.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                    <span>{feedback.message}</span>
                    <button type="button" className="collectionsAdminAlertClose" onClick={() => setFeedback({ type: '', message: '' })} aria-label="Dismiss">
                        &times;
                    </button>
                </div>
            )}

            {/* Header & Actions */}
            <div className="collectionsAdminHeader">
                <div>
                    <span className="collectionsAdminKanjiSub">商品コレクション管理 / ARCHIVE TAXONOMY</span>
                    <h2 className="collectionsAdminTitle">Shop Collections & Curations</h2>
                    <p className="collectionsAdminSubtitle">
                        Curate public archive collections, order display sequences, artwork, and pair memberships.
                    </p>
                </div>
                <div className="collectionsAdminHeaderActions">
                    <button
                        type="button"
                        className="collectionsAdminButton secondary"
                        onClick={() => { loadCategories(); loadProducts(); }}
                        disabled={categoriesLoading || productsLoading}
                        title="Reload Collections and Products"
                    >
                        <RefreshCw size={16} className={categoriesLoading || productsLoading ? 'spin' : ''} />
                        Refresh
                    </button>
                    <button
                        type="button"
                        className="collectionsAdminButton primary"
                        onClick={handleOpenCreateCategory}
                    >
                        <Plus size={16} />
                        New Collection
                    </button>
                </div>
            </div>

            {/* Main two-column curation workspace */}
            <div className="collectionsAdminGrid">
                {/* Column 1: Collections Directory */}
                <section className="collectionsAdminColumn" aria-labelledby="collections-directory-heading">
                    <div className="collectionsAdminColumnHeader">
                        <div className="collectionsAdminColumnTitle">
                            <div className="collectionsColumnIcon"><Layers size={18} /></div>
                            <div>
                                <span className="collectionsColumnKanji">分類一覧 / ARCHIVE DIRECTORY</span>
                                <h3 id="collections-directory-heading">Collections Directory</h3>
                            </div>
                        </div>
                        <span className="collectionsAdminBadge">
                            {categories.length} {categories.length === 1 ? 'Collection' : 'Collections'}
                        </span>
                    </div>

                    {categoriesLoading ? (
                        <div className="collectionsAdminState">Loading collections...</div>
                    ) : categoriesError ? (
                        <div className="collectionsAdminState error">
                            <AlertCircle size={20} />
                            <span>{categoriesError}</span>
                            <button type="button" className="collectionsAdminRetryBtn" onClick={loadCategories}>Retry</button>
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="collectionsAdminState">
                            No collections configured. Create one to get started.
                        </div>
                    ) : (
                        <div className="collectionsList">
                            {categories.map((cat) => {
                                const memberCount = memberships.filter((m) => m.category_id === cat.id).length;
                                const isSelected = selectedCategoryId === cat.id;

                                return (
                                    <div
                                        key={cat.id}
                                        className={`collectionCard ${isSelected ? 'isSelected' : ''}`}
                                        onClick={() => setSelectedCategoryId(cat.id)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCategoryId(cat.id); } }}
                                        aria-label={`Select collection ${cat.name}`}
                                    >
                                        <div className="collectionArtwork">
                                            {(() => {
                                                const artworkSrc = resolveCollectionArtwork(cat);
                                                return artworkSrc && !brokenThumbnails[artworkSrc] ? (
                                                    <img
                                                        src={artworkSrc}
                                                        alt=""
                                                        className="collectionThumbImage"
                                                        onError={() => setBrokenThumbnails((prev) => ({ ...prev, [artworkSrc]: true }))}
                                                    />
                                                ) : (
                                                    <div className="collectionNeutralArtwork" aria-hidden="true">
                                                        <ImageIcon size={20} />
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <div className="collectionInfo">
                                            <div className="collectionMetaTop">
                                                <span className="collectionOrderBadge">#{cat.display_order}</span>
                                                <span className={`collectionVisibilityBadge ${cat.is_visible ? 'isVisible' : 'isHidden'}`}>
                                                    {cat.is_visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                                    {cat.is_visible ? 'Visible' : 'Hidden'}
                                                </span>
                                            </div>
                                            <h4 className="collectionName">{cat.name}</h4>
                                            <span className="collectionSlug">slug: {cat.slug}</span>
                                            <span className="collectionPairsCount">
                                                {memberCount} {memberCount === 1 ? 'pair assigned' : 'pairs assigned'}
                                            </span>
                                        </div>

                                        <div className="collectionActions" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="collectionActionBtn"
                                                onClick={() => handleOpenEditCategory(cat)}
                                                title="Edit collection"
                                                aria-label={`Edit ${cat.name}`}
                                            >
                                                <Edit3 size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                className="collectionActionBtn danger"
                                                onClick={() => handleDeleteCategory(cat)}
                                                title="Delete collection"
                                                aria-label={`Delete ${cat.name}`}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Column 2: Product Membership Picker */}
                <section className="collectionsAdminColumn" aria-labelledby="collection-pairs-heading">
                    <div className="collectionsAdminColumnHeader">
                        <div className="collectionsAdminColumnTitle">
                            <div className="collectionsColumnIcon"><Package size={18} /></div>
                            <div>
                                <span className="collectionsColumnKanji">割当ペア / CURATED MEMBERS</span>
                                <h3 id="collection-pairs-heading">
                                    {selectedCategory ? `Curate "${selectedCategory.name}"` : 'Collection Pairs'}
                                </h3>
                                {selectedCategory && (
                                    <a
                                        href={`/shop?group=${encodeURIComponent(selectedCategory.slug)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="collectionsLiveStoreLink"
                                    >
                                        Live view: /shop?group={selectedCategory.slug} &nearr;
                                    </a>
                                )}
                            </div>
                        </div>
                        {onOpenCreateDrop && (
                            <button
                                type="button"
                                className="collectionsAdminCreateProductBtn"
                                onClick={onOpenCreateDrop}
                            >
                                <Plus size={14} />
                                Create Drop
                            </button>
                        )}
                    </div>

                    {!selectedCategory ? (
                        <div className="collectionsAdminState">Select a collection on the left to assign pairs.</div>
                    ) : (
                        <div className="collectionsPairsWorkspace">
                            {/* Product Search & Counter */}
                            <div className="collectionsPairsSearchRow">
                                <div className="collectionsSearchInputWrapper">
                                    <Search size={16} className="collectionsSearchIcon" />
                                    <input
                                        type="text"
                                        placeholder="Search catalog by name, brand, or ID..."
                                        value={productSearchQuery}
                                        onChange={(e) => setProductSearchQuery(e.target.value)}
                                        className="collectionsSearchInput"
                                    />
                                    {productSearchQuery && (
                                        <button
                                            type="button"
                                            className="collectionsSearchClearBtn"
                                            onClick={() => setProductSearchQuery('')}
                                        >
                                            &times;
                                        </button>
                                    )}
                                </div>
                                <span className="collectionsAssignedBadge">
                                    {assignedProducts.length} Assigned
                                </span>
                            </div>

                            {/* Products List (separate loading and error) */}
                            {productsLoading ? (
                                <div className="collectionsAdminState">Loading catalog pairs...</div>
                            ) : productsError ? (
                                <div className="collectionsAdminState error">
                                    <AlertCircle size={20} />
                                    <span>{productsError}</span>
                                    <button type="button" className="collectionsAdminRetryBtn" onClick={loadProducts}>Retry</button>
                                </div>
                            ) : (
                                <div className="collectionsSectionsContainer">
                                    {/* Section 1: Assigned to this collection */}
                                    <div className="collectionsSectionHeader">
                                        <div className="collectionsSectionTitleRow">
                                            <span className="collectionsSectionLabel">Assigned to this Collection</span>
                                            <span className="collectionsSectionPill">{assignedProducts.length} pairs</span>
                                        </div>
                                        <span className="collectionsSectionHint">
                                            These pairs appear on <code>/shop?group={selectedCategory.slug}</code>
                                        </span>
                                    </div>

                                    {assignedProducts.length === 0 ? (
                                        <div className="collectionsEmptyAssignedNotice">
                                            <Package size={22} className="collectionsEmptyIcon" />
                                            <div className="collectionsEmptyText">
                                                <strong>No pairs assigned to "{selectedCategory.name}" yet.</strong>
                                                <span>Browse the catalog below and click <em>+ Assign</em> to feature pairs in this collection.</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="collectionsProductsList assignedList">
                                            {filteredAssignedProducts.map((prod) => {
                                                const isBusy = assigningProductId === prod.id;
                                                return (
                                                    <div
                                                        key={prod.id}
                                                        className="collectionProductItem isAssigned"
                                                    >
                                                        <div className="collectionProductThumb">
                                                            <img
                                                                src={prod.frontImage || '/shoes/transparent/shoe-1-front.png'}
                                                                alt={prod.name}
                                                            />
                                                        </div>
                                                        <div className="collectionProductDetails">
                                                            <span className="collectionProductBrand">{prod.brand}</span>
                                                            <h5 className="collectionProductName">{prod.name}</h5>
                                                            <span className="collectionProductMeta">
                                                                ID: #{prod.id} &bull; Size: {prod.size} &bull; {prod.currency || 'INR'} {(prod.priceMinor / 100).toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <div className="collectionProductAction">
                                                            <button
                                                                type="button"
                                                                className="collectionAssignToggle isAssigned"
                                                                onClick={() => handleToggleAssignment(prod.id)}
                                                                disabled={isBusy}
                                                                aria-label={`Remove ${prod.name} from collection`}
                                                            >
                                                                <Check size={14} /> Assigned
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredAssignedProducts.length === 0 && productSearchQuery && (
                                                <div className="collectionsAdminState small">No assigned pairs match your search.</div>
                                            )}
                                        </div>
                                    )}

                                    {/* Section 2: Available catalog pairs */}
                                    <div className="collectionsSectionHeader availableHeader">
                                        <div className="collectionsSectionTitleRow">
                                            <span className="collectionsSectionLabel">Available Catalog Pairs</span>
                                            <span className="collectionsSectionPill neutral">{filteredUnassignedProducts.length} available</span>
                                        </div>
                                        <span className="collectionsSectionHint">
                                            Click <em>+ Assign</em> to add any catalog drop to "{selectedCategory.name}"
                                        </span>
                                    </div>

                                    {filteredUnassignedProducts.length === 0 ? (
                                        <div className="collectionsAdminState small">
                                            {productSearchQuery
                                                ? 'No unassigned catalog pairs match your search.'
                                                : 'All available catalog pairs are assigned to this collection.'}
                                        </div>
                                    ) : (
                                        <div className="collectionsProductsList availableList">
                                            {filteredUnassignedProducts.map((prod) => {
                                                const isBusy = assigningProductId === prod.id;
                                                return (
                                                    <div
                                                        key={prod.id}
                                                        className="collectionProductItem"
                                                    >
                                                        <div className="collectionProductThumb">
                                                            <img
                                                                src={prod.frontImage || '/shoes/transparent/shoe-1-front.png'}
                                                                alt={prod.name}
                                                            />
                                                        </div>
                                                        <div className="collectionProductDetails">
                                                            <span className="collectionProductBrand">{prod.brand}</span>
                                                            <h5 className="collectionProductName">{prod.name}</h5>
                                                            <span className="collectionProductMeta">
                                                                ID: #{prod.id} &bull; Size: {prod.size} &bull; {prod.currency || 'INR'} {(prod.priceMinor / 100).toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <div className="collectionProductAction">
                                                            <button
                                                                type="button"
                                                                className="collectionAssignToggle"
                                                                onClick={() => handleToggleAssignment(prod.id)}
                                                                disabled={isBusy}
                                                                aria-label={`Assign ${prod.name} to collection`}
                                                            >
                                                                <Plus size={14} /> Assign
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </div>

            {/* Category Form Modal (Create / Edit) */}
            {showCategoryModal && (
                <div className="collectionsModalOverlay" role="dialog" aria-modal="true" aria-labelledby="collection-modal-title">
                    <div className="collectionsModalCard">
                        <div className="collectionsModalHeader">
                            <div>
                                <span className="collectionsModalKanji">コレクション設定 / ARCHIVE SPEC</span>
                                <h3 id="collection-modal-title">
                                    {editingCategoryId ? 'Edit Collection' : 'Create New Collection'}
                                </h3>
                            </div>
                            <button
                                type="button"
                                className="collectionsModalClose"
                                onClick={() => setShowCategoryModal(false)}
                                aria-label="Close dialog"
                            >
                                &times;
                            </button>
                        </div>

                        {categoryFormErrors.form && (
                            <div className="collectionsFormError">
                                <AlertCircle size={16} />
                                <span>{categoryFormErrors.form}</span>
                            </div>
                        )}

                        <form onSubmit={handleSaveCategory} className="collectionsForm">
                            <div className="collectionsFormGroup">
                                <label htmlFor="col-name" className="collectionsFormLabel">Collection Name *</label>
                                <input
                                    id="col-name"
                                    type="text"
                                    className="collectionsFormInput"
                                    placeholder="e.g. Vintage Runners, Tokyo Vault Archive"
                                    value={categoryForm.name}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                                    required
                                />
                                {categoryFormErrors.name && (
                                    <span className="collectionsFieldError">{categoryFormErrors.name}</span>
                                )}
                            </div>

                            <div className="collectionsFormGroup">
                                <label htmlFor="col-slug" className="collectionsFormLabel">
                                    URL Slug <span className="collectionsFormHint">(Optional; autogenerated from name if blank)</span>
                                </label>
                                <input
                                    id="col-slug"
                                    type="text"
                                    className="collectionsFormInput"
                                    placeholder="e.g. vintage-runners"
                                    value={categoryForm.slug}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                                />
                            </div>

                            <div className="collectionsFormRow">
                                <div className="collectionsFormGroup">
                                    <label htmlFor="col-order" className="collectionsFormLabel">Display Order</label>
                                    <input
                                        id="col-order"
                                        type="number"
                                        min="1"
                                        className="collectionsFormInput"
                                        value={categoryForm.display_order}
                                        onChange={(e) => setCategoryForm({ ...categoryForm, display_order: e.target.value })}
                                    />
                                </div>

                                <div className="collectionsFormGroup collectionsCheckboxGroup">
                                    <label className="collectionsCheckboxLabel">
                                        <input
                                            type="checkbox"
                                            checked={categoryForm.is_visible}
                                            onChange={(e) => setCategoryForm({ ...categoryForm, is_visible: e.target.checked })}
                                        />
                                        <span>Visible in Public Shop</span>
                                    </label>
                                </div>
                            </div>

                            <div className="collectionsFormGroup">
                                <label className="collectionsFormLabel">
                                    Collection Artwork <span className="collectionsFormHint">(Neutral artwork applied if left blank)</span>
                                </label>

                                {categoryForm.image_url ? (
                                    <div className="collectionsArtworkPreviewWrapper">
                                        <div className="collectionsArtworkPreviewThumb">
                                            {previewImageError ? (
                                                <div className="collectionNeutralArtwork" aria-hidden="true">
                                                    <ImageIcon size={20} />
                                                </div>
                                            ) : (
                                                <img
                                                    src={categoryForm.image_url}
                                                    alt="Artwork Preview"
                                                    className="collectionsArtworkPreviewImage"
                                                    onError={() => setPreviewImageError(true)}
                                                />
                                            )}
                                        </div>
                                        <div className="collectionsArtworkPreviewInfo">
                                            <span className="collectionsArtworkSourceType">
                                                {categoryForm.image_url.startsWith('data:') ? 'Local file (Base64 stored locally)' : categoryForm.image_url.startsWith('/') ? 'Local Asset' : 'Image URL'}
                                                {previewImageError ? ' (Failed to load)' : ''}
                                            </span>
                                            <button
                                                type="button"
                                                className="collectionsArtworkRemoveBtn"
                                                onClick={handleClearImage}
                                                title="Remove image"
                                            >
                                                <Trash2 size={13} />
                                                Remove Image
                                            </button>
                                        </div>
                                    </div>
                                ) : null}

                                <div className="collectionsArtworkControls">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        id="col-image-file"
                                        accept="image/*"
                                        className="collectionsFileInput"
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                    />
                                    <button
                                        type="button"
                                        className="collectionsAdminButton secondary collectionsUploadButton"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <Upload size={15} />
                                        <span>{categoryForm.image_url?.startsWith('data:') ? 'Change Local Image' : 'Upload from Device'}</span>
                                    </button>

                                    <div className="collectionsArtworkDivider">
                                        <span>or paste image / pinterest link</span>
                                    </div>

                                    <div className="collectionsUrlInputRow">
                                        <input
                                            id="col-image"
                                            type="text"
                                            className="collectionsFormInput"
                                            placeholder="https://... (Pinterest pin or image URL) or /shoes/..."
                                            value={categoryForm.image_url?.startsWith('data:') ? '' : urlInput}
                                            disabled={categoryForm.image_url?.startsWith('data:') || downloadingImage}
                                            onChange={(e) => {
                                                if (fileInputRef.current) fileInputRef.current.value = '';
                                                const val = e.target.value;
                                                setUrlInput(val);
                                                setPreviewImageError(false);
                                                setDownloadError('');
                                                setDownloadSuccess('');
                                                setCategoryForm({ ...categoryForm, image_url: val });
                                            }}
                                            onPaste={handleUrlPaste}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && (urlInput.startsWith('http://') || urlInput.startsWith('https://'))) {
                                                    e.preventDefault();
                                                    handleDownloadRemoteImage();
                                                }
                                            }}
                                        />
                                        {(urlInput.startsWith('http://') || urlInput.startsWith('https://')) && !categoryForm.image_url?.startsWith('data:') && (
                                            <button
                                                type="button"
                                                className="collectionsDownloadButton"
                                                onClick={() => handleDownloadRemoteImage()}
                                                disabled={downloadingImage || !urlInput.trim()}
                                                title="Download image and save locally as Base64 data URL"
                                            >
                                                {downloadingImage ? (
                                                    <>
                                                        <Loader2 size={14} className="spin" />
                                                        <span>Downloading...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download size={14} />
                                                        <span>Download Locally</span>
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>

                                    {downloadingImage && (
                                        <div className="collectionsDownloadProgress" role="status">
                                            <Loader2 size={15} className="spin" />
                                            <span>{downloadStatus || 'Downloading image locally...'}</span>
                                        </div>
                                    )}

                                    {downloadSuccess && (
                                        <div className="collectionsDownloadSuccess" role="status">
                                            <Check size={15} />
                                            <span>{downloadSuccess}</span>
                                        </div>
                                    )}

                                    {downloadError && (
                                        <div className="collectionsDownloadError" role="alert">
                                            <AlertCircle size={15} />
                                            <div>
                                                <div>{downloadError}</div>
                                                <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', opacity: 0.9 }}>
                                                    Tip: You can retry, right-click and copy the direct image address (e.g. i.pinimg.com), or use "Upload from Device".
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {urlGuidanceNote && !downloadingImage && !downloadSuccess && (
                                        <div className="collectionsUrlGuidance" role="alert">
                                            <AlertCircle size={15} className="collectionsGuidanceIcon" />
                                            <span>{urlGuidanceNote}</span>
                                        </div>
                                    )}
                                </div>
                                {categoryFormErrors.image && (
                                    <span className="collectionsFieldError">{categoryFormErrors.image}</span>
                                )}
                            </div>

                            <div className="collectionsModalActions">
                                <button
                                    type="button"
                                    className="collectionsAdminButton secondary"
                                    onClick={() => {
                                        setShowCategoryModal(false);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    disabled={savingCategory}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="collectionsAdminButton primary"
                                    disabled={savingCategory}
                                >
                                    {savingCategory ? 'Saving...' : editingCategoryId ? 'Save Changes' : 'Create Collection'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
