import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import { shopCategoriesService, subscribeShopUpdates } from '../services/shopCategories.js';
import './ShopCollectionsAdmin.css';

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
        return new Set(
            memberships
                .filter((m) => m.category_id === selectedCategoryId)
                .map((m) => m.product_id)
        );
    }, [memberships, selectedCategoryId]);

    // Open category modal for creation
    const handleOpenCreateCategory = () => {
        const nextOrder = categories.reduce((max, c) => Math.max(max, c.display_order || 0), 0) + 1;
        setEditingCategoryId(null);
        setCategoryForm({
            name: '',
            slug: '',
            image_url: '',
            display_order: nextOrder,
            is_visible: true,
        });
        setCategoryFormErrors({});
        setShowCategoryModal(true);
    };

    // Open category modal for editing
    const handleOpenEditCategory = (cat) => {
        setEditingCategoryId(cat.id);
        setCategoryForm({
            name: cat.name || '',
            slug: cat.slug || '',
            image_url: cat.image_url || '',
            display_order: cat.display_order || 1,
            is_visible: cat.is_visible !== false,
        });
        setCategoryFormErrors({});
        setShowCategoryModal(true);
    };

    // Save category (Create or Update)
    const handleSaveCategory = async (e) => {
        e.preventDefault();
        setCategoryFormErrors({});

        if (!categoryForm.name.trim()) {
            setCategoryFormErrors({ name: 'Collection name is required.' });
            return;
        }

        const payload = {
            ...(editingCategoryId ? { id: editingCategoryId } : {}),
            name: categoryForm.name.trim(),
            slug: categoryForm.slug.trim() || undefined,
            image_url: categoryForm.image_url.trim() || null,
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
            // Optimistically or synchronously update memberships
            setMemberships((prev) => {
                if (nextState) {
                    return [...prev.filter((m) => !(m.category_id === selectedCategoryId && m.product_id === productId)), { category_id: selectedCategoryId, product_id: productId }];
                } else {
                    return prev.filter((m) => !(m.category_id === selectedCategoryId && m.product_id === productId));
                }
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

    // Filter products for searchable assignment list
    const filteredProducts = useMemo(() => {
        if (!productSearchQuery.trim()) return products;
        const q = productSearchQuery.toLowerCase();
        return products.filter((p) =>
            p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            String(p.id).includes(q)
        );
    }, [products, productSearchQuery]);

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
                                            {cat.image_url ? (
                                                <img src={cat.image_url} alt="" className="collectionThumbImage" />
                                            ) : (
                                                <div className="collectionNeutralArtwork" aria-hidden="true">
                                                    <ImageIcon size={20} />
                                                </div>
                                            )}
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
                                    {selectedCategory ? `Pairs in "${selectedCategory.name}"` : 'Collection Pairs'}
                                </h3>
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
                                    {assignedProductIds.size} Assigned
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
                            ) : filteredProducts.length === 0 ? (
                                <div className="collectionsAdminState">
                                    {productSearchQuery ? 'No pairs matched your search.' : 'No pairs exist in catalog.'}
                                </div>
                            ) : (
                                <div className="collectionsProductsList">
                                    {filteredProducts.map((prod) => {
                                        const isAssigned = assignedProductIds.has(prod.id);
                                        const isBusy = assigningProductId === prod.id;

                                        return (
                                            <div
                                                key={prod.id}
                                                className={`collectionProductItem ${isAssigned ? 'isAssigned' : ''}`}
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
                                                        className={`collectionAssignToggle ${isAssigned ? 'isAssigned' : ''}`}
                                                        onClick={() => handleToggleAssignment(prod.id)}
                                                        disabled={isBusy}
                                                        aria-label={isAssigned ? `Remove ${prod.name} from collection` : `Assign ${prod.name} to collection`}
                                                    >
                                                        {isAssigned ? (
                                                            <>
                                                                <Check size={14} /> Assigned
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Plus size={14} /> Assign
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
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
                                <label htmlFor="col-image" className="collectionsFormLabel">
                                    Artwork Image URL <span className="collectionsFormHint">(Neutral artwork applied if left blank)</span>
                                </label>
                                <input
                                    id="col-image"
                                    type="url"
                                    className="collectionsFormInput"
                                    placeholder="https://... or /shoes/transparent/shoe-1-front.png"
                                    value={categoryForm.image_url}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, image_url: e.target.value })}
                                />
                            </div>

                            <div className="collectionsModalActions">
                                <button
                                    type="button"
                                    className="collectionsAdminButton secondary"
                                    onClick={() => setShowCategoryModal(false)}
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
