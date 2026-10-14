import React, { useState, useEffect } from 'react';
import {
    Plus,
    Edit3,
    Trash2,
    RotateCcw,
    Layers,
    CheckCircle2,
    AlertCircle,
    Save,
    X,
} from 'lucide-react';
import {
    getHomeShowcaseShoes,
    addHomeShowcaseShoe,
    updateHomeShowcaseShoe,
    deleteHomeShowcaseShoe,
    resetHomeShowcaseShoes,
    subscribeHomeShowcase,
} from '../services/homeShowcase.js';
import './AdminShowcaseAndDrops.css';

const PRESET_OPTIONS = [
    { label: 'Shoe 1', front: '/shoes/transparent/shoe-1-front.png', side: '/shoes/transparent/shoe-1-side.png' },
    { label: 'Shoe 2', front: '/shoes/transparent/shoe-2-front.png', side: '/shoes/transparent/shoe-2-side.png' },
    { label: 'Shoe 3', front: '/shoes/transparent/shoe-3-front.png', side: '/shoes/transparent/shoe-3-side.png' },
    { label: 'Shoe 4', front: '/shoes/transparent/shoe-4-front.png', side: '/shoes/transparent/shoe-4-side.png' },
    { label: 'Shoe 5', front: '/shoes/transparent/shoe-5-front.png', side: '/shoes/transparent/shoe-5-side.png' },
    { label: 'Adidas', front: '/shoes/transparent/adidas.png', side: '/shoes/transparent/adidas.png' },
    { label: 'New Balance', front: '/shoes/transparent/new-balance.png', side: '/shoes/transparent/new-balance.png' },
];

const INITIAL_FORM = {
    id: '',
    name: '',
    brand: 'SOLETHIEF',
    price: 18500,
    size: 'US 9.5',
    frontImage: '/shoes/transparent/shoe-1-front.png',
    sideImage: '/shoes/transparent/shoe-1-side.png',
    mass: 1.2,
    frictionAir: 0.05,
    restitution: 0.4,
    initialRotation: 0,
};

export default function AdminHomeShowcase() {
    const [shoes, setShoes] = useState(() => getHomeShowcaseShoes());
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
    const [formData, setFormData] = useState(INITIAL_FORM);

    useEffect(() => {
        return subscribeHomeShowcase((updated) => {
            setShoes(updated);
        });
    }, []);

    const openAddModal = () => {
        setFormData({
            ...INITIAL_FORM,
            id: `showcase-${Date.now()}`,
            name: `SHOWCASE ITEM #${shoes.length + 1}`,
        });
        setModalMode('add');
    };

    const openEditModal = (shoe) => {
        setFormData({
            id: shoe.id,
            name: shoe.name || '',
            brand: shoe.brand || 'SOLETHIEF',
            price: shoe.price ?? 18500,
            size: shoe.size || 'US 9',
            frontImage: shoe.frontImage || shoe.image || '',
            sideImage: shoe.sideImage || shoe.image || '',
            mass: shoe.physics?.mass ?? 1.2,
            frictionAir: shoe.physics?.frictionAir ?? 0.05,
            restitution: shoe.physics?.restitution ?? 0.4,
            initialRotation: shoe.physics?.initialRotation ?? 0,
        });
        setModalMode('edit');
    };

    const closeModal = () => {
        setModalMode(null);
    };

    const handleSave = (e) => {
        e.preventDefault();
        try {
            if (!formData.name.trim()) {
                setFeedback({ type: 'error', message: 'Shoe name is required.' });
                return;
            }
            if (!formData.frontImage.trim()) {
                setFeedback({ type: 'error', message: 'Front image URL is required.' });
                return;
            }

            const shoePayload = {
                id: formData.id,
                name: formData.name.trim(),
                brand: formData.brand.trim() || 'SOLETHIEF',
                price: Number(formData.price) || 0,
                size: formData.size.trim() || 'US 9',
                frontImage: formData.frontImage.trim(),
                sideImage: (formData.sideImage || formData.frontImage).trim(),
                physics: {
                    mass: parseFloat(formData.mass) || 1.2,
                    frictionAir: parseFloat(formData.frictionAir) || 0.05,
                    restitution: parseFloat(formData.restitution) || 0.4,
                    initialRotation: parseFloat(formData.initialRotation) || 0,
                },
            };

            if (modalMode === 'add') {
                addHomeShowcaseShoe(shoePayload);
                setFeedback({ type: 'success', message: `Added "${shoePayload.name}" to Home Showcase!` });
            } else {
                updateHomeShowcaseShoe(formData.id, shoePayload);
                setFeedback({ type: 'success', message: `Updated "${shoePayload.name}" on Home Showcase!` });
            }
            closeModal();
        } catch (err) {
            setFeedback({ type: 'error', message: err.message || 'Failed to save showcase shoe' });
        }
    };

    const handleDelete = (id, name) => {
        if (window.confirm(`Are you sure you want to remove "${name}" from the Home page hero?`)) {
            deleteHomeShowcaseShoe(id);
            setFeedback({ type: 'success', message: `Removed "${name}" from Home Showcase!` });
        }
    };

    const handleReset = () => {
        if (window.confirm('Reset Home Showcase shoes to original default 4 pairs? Any added or modified shoes will be replaced.')) {
            resetHomeShowcaseShoes();
            setFeedback({ type: 'success', message: 'Home Showcase shoes reset to original defaults!' });
        }
    };

    return (
        <section className="adminSection" aria-labelledby="home-showcase-title">
            <div className="adminSectionToolbar">
                <div>
                    <h2 id="home-showcase-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Layers size={22} color="#ff5e00" />
                        <span>HOME HERO FLOATING SHOES SHOWCASE</span>
                    </h2>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'rgba(21, 27, 43, 0.65)' }}>
                        Manage the 4 dynamic interactive physics shoes floating around the hero text on the Home page. Add, edit, change images, or delete live.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        type="button"
                        className="adminSecondaryButton"
                        onClick={handleReset}
                        title="Reset to default 4 showcase shoes"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <RotateCcw size={16} />
                        <span>Reset Defaults</span>
                    </button>
                    <button
                        type="button"
                        className="adminPrimaryButton"
                        onClick={openAddModal}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Plus size={18} />
                        <span>Add Showcase Shoe</span>
                    </button>
                </div>
            </div>

            {feedback.message && (
                <div
                    className="adminAlert"
                    style={{
                        marginBottom: '1.5rem',
                        padding: '0.85rem 1.25rem',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        backgroundColor: feedback.type === 'error' ? '#fef2f2' : '#f0fdf4',
                        color: feedback.type === 'error' ? '#991b1b' : '#166534',
                        border: `1px solid ${feedback.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
                    }}
                >
                    {feedback.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                    <span>{feedback.message}</span>
                </div>
            )}

            <div className="adminShowcaseGrid">
                {shoes.map((shoe, idx) => {
                    const frontImg = shoe.frontImage || shoe.image || '/shoes/transparent/shoe-1-front.png';
                    return (
                        <div key={shoe.id || idx} className="adminShowcaseCard">
                            <div className="adminShowcaseCardPreview">
                                <img
                                    src={frontImg}
                                    alt={shoe.name}
                                    onError={(e) => {
                                        e.currentTarget.src = '/shoes/transparent/shoe-1-front.png';
                                    }}
                                />
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: '10px',
                                        left: '10px',
                                        background: '#151B2B',
                                        color: '#ffffff',
                                        fontSize: '0.7rem',
                                        fontWeight: '700',
                                        padding: '2px 8px',
                                        borderRadius: '3px',
                                        letterSpacing: '0.05em',
                                    }}
                                >
                                    SLOT #{idx + 1}
                                </span>
                            </div>
                            <div className="adminShowcaseCardBody">
                                <span className="adminShowcaseCardBrand">{shoe.brand || 'SOLETHIEF'}</span>
                                <h3 className="adminShowcaseCardTitle">{shoe.name}</h3>
                                <div className="adminShowcaseCardMeta">
                                    <span>Size: <strong>{shoe.size || 'US 9'}</strong></span>
                                    <span className="adminShowcaseCardPrice">₹{Number(shoe.price || 0).toLocaleString('en-IN')}</span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(21, 27, 43, 0.55)', marginBottom: '1rem' }}>
                                    Physics: Mass {shoe.physics?.mass ?? 1.2} • Restitution {shoe.physics?.restitution ?? 0.4}
                                </div>
                                <div className="adminShowcaseCardActions">
                                    <button
                                        type="button"
                                        className="adminSecondaryButton"
                                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.5rem' }}
                                        onClick={() => openEditModal(shoe)}
                                    >
                                        <Edit3 size={14} />
                                        <span>Edit</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="adminSecondaryButton"
                                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.5rem', color: '#dc2626', borderColor: '#fca5a5' }}
                                        onClick={() => handleDelete(shoe.id, shoe.name)}
                                        title="Delete from showcase"
                                    >
                                        <Trash2 size={14} />
                                        <span>Delete</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal for Add / Edit */}
            {modalMode && (
                <div className="adminModalOverlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="adminModal" style={{ maxWidth: '640px', width: '100%' }}>
                        <div className="adminModalHeader">
                            <h3>{modalMode === 'add' ? 'Add Home Showcase Shoe' : `Edit Showcase: ${formData.name}`}</h3>
                            <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(21, 27, 43, 0.6)' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSave} style={{ padding: '1.5rem' }}>
                            <div className="adminFormGrid">
                                <div className="adminShowcaseFormGroup">
                                    <label className="adminFormLabel">
                                        <span>SHOE / MODEL NAME *</span>
                                        <input
                                            type="text"
                                            className="adminInput"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g. TRAVIS SCOTT x AIR JORDAN 1 LOW"
                                            required
                                        />
                                    </label>
                                </div>
                                <div className="adminShowcaseFormGroup">
                                    <label className="adminFormLabel">
                                        <span>BRAND *</span>
                                        <input
                                            type="text"
                                            className="adminInput"
                                            value={formData.brand}
                                            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                            placeholder="e.g. NIKE / JORDAN / ADIDAS"
                                            required
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="adminFormGrid">
                                <div className="adminShowcaseFormGroup">
                                    <label className="adminFormLabel">
                                        <span>PRICE (INR) *</span>
                                        <input
                                            type="number"
                                            className="adminInput"
                                            value={formData.price}
                                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                            placeholder="18500"
                                            min="0"
                                            required
                                        />
                                    </label>
                                </div>
                                <div className="adminShowcaseFormGroup">
                                    <label className="adminFormLabel">
                                        <span>SHOWCASE SIZE *</span>
                                        <input
                                            type="text"
                                            className="adminInput"
                                            value={formData.size}
                                            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                                            placeholder="US 9.5"
                                            required
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="adminShowcaseFormGroup">
                                <label className="adminFormLabel">
                                    <span>FRONT PROFILE IMAGE PATH OR URL *</span>
                                    <input
                                        type="text"
                                        className="adminInput"
                                        value={formData.frontImage}
                                        onChange={(e) => setFormData({ ...formData, frontImage: e.target.value })}
                                        placeholder="/shoes/transparent/shoe-1-front.png or https://..."
                                        required
                                    />
                                </label>
                            </div>

                            <div className="adminShowcaseFormGroup">
                                <label className="adminFormLabel">
                                    <span>SIDE PROFILE IMAGE PATH OR URL</span>
                                    <input
                                        type="text"
                                        className="adminInput"
                                        value={formData.sideImage}
                                        onChange={(e) => setFormData({ ...formData, sideImage: e.target.value })}
                                        placeholder="/shoes/transparent/shoe-1-side.png or https://..."
                                    />
                                </label>
                            </div>

                            <div style={{ marginBottom: '1.25rem' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: '700', letterSpacing: '0.05em', color: 'rgba(21, 27, 43, 0.7)' }}>
                                    QUICK PRESET IMAGE PICKS
                                </span>
                                <div className="adminQuickPicksContainer">
                                    {PRESET_OPTIONS.map((opt, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            className="adminSecondaryButton"
                                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                            onClick={() => setFormData({
                                                ...formData,
                                                frontImage: opt.front,
                                                sideImage: opt.side,
                                            })}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ padding: '1rem', background: '#f8f9fb', borderRadius: '4px', marginBottom: '1.5rem', border: '1px solid rgba(21, 27, 43, 0.08)' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#151B2B', display: 'block', marginBottom: '0.75rem' }}>
                                    PHYSICS SIMULATION TUNING
                                </span>
                                <div className="adminFormGrid">
                                    <label className="adminFormLabel">
                                        <span style={{ fontSize: '0.75rem' }}>MASS (Weight)</span>
                                        <input
                                            type="number"
                                            step="0.1"
                                            className="adminInput"
                                            value={formData.mass}
                                            onChange={(e) => setFormData({ ...formData, mass: e.target.value })}
                                        />
                                    </label>
                                    <label className="adminFormLabel">
                                        <span style={{ fontSize: '0.75rem' }}>BOUNCE (Restitution)</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="1"
                                            className="adminInput"
                                            value={formData.restitution}
                                            onChange={(e) => setFormData({ ...formData, restitution: e.target.value })}
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="adminModalFooter" style={{ padding: 0 }}>
                                <button type="button" className="adminSecondaryButton" onClick={closeModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="adminPrimaryButton" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Save size={16} />
                                    <span>{modalMode === 'add' ? 'Add To Home Showcase' : 'Save Changes'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </section>
    );
}
