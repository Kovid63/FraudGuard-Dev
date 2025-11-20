// pages/access.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Sidebar from '../ui/components/Sidebar';
import {
    ShieldOff,
    ShieldCheck,
    CirclePlus,
    LucideGlobe,
    LucideMapPin,
    LucideMail,
    LucidePhone,
    LucideHome,
    LucideTrash2,
    LucideShieldBan,
    LucideX,
    LucideEdit,
    LucideSearch
} from 'lucide-react';

// Define types for your data
interface Rule {
    id: string;
    type: 'Country' | 'IP Address' | 'Email' | 'Phone' | 'Address';
    value: string;
    notes?: string;
    added: string;
}

interface SummaryCardProps {
    icon: React.ElementType;
    title: string;
    count: number;
}

interface Country {
    name: string;
    code: string;
}

// Reusable SummaryCard component
const SummaryCard: React.FC<SummaryCardProps> = ({ icon: Icon, title, count }) => (
    <div className="flex flex-col items-start p-4 bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="flex items-center justify-between w-full mb-2">
            <span className="text-slate-600 text-sm">{title}</span>
            <Icon size={16} className="text-slate-400" />
        </div>
        <span className="text-2xl font-bold text-slate-800">
            {count}
        </span>
    </div>
);

// This is the main page component that will be rendered
const AccessControlPage = () => {
    const router = useRouter();
    const { shop, host } = router.query;
    const [activeTab, setActiveTab] = useState<'blocklist' | 'whitelist'>('blocklist');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [editingRule, setEditingRule] = useState<Rule | null>(null);
    const [countries, setCountries] = useState<Country[]>([]);
    const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
    const [countrySearchQuery, setCountrySearchQuery] = useState('');

    // Alert state
    const [alert, setAlert] = useState<{
        show: boolean;
        type: 'success' | 'error' | 'confirm';
        title: string;
        message: string;
        onConfirm?: () => void;
    }>({
        show: false,
        type: 'success',
        title: '',
        message: '',
    });

    // Form state
    const [formData, setFormData] = useState({
        type: '',
        value: '',
        notes: ''
    });

    const [blocklistRules, setBlocklistRules] = useState<Rule[]>([]);
    const [whitelistRules, setWhitelistRules] = useState<Rule[]>([]);

    // Show custom alert
    const showAlert = (type: 'success' | 'error' | 'confirm', title: string, message: string, onConfirm?: () => void) => {
        setAlert({ show: true, type, title, message, onConfirm });
    };

    const hideAlert = () => {
        setAlert({ show: false, type: 'success', title: '', message: '' });
    };

    // Fetch countries from REST Countries API
    useEffect(() => {
        const fetchCountries = async () => {
            try {
                const response = await fetch('https://restcountries.com/v3.1/all?fields=name');
                const data = await response.json();
                const countryList = data.map((country: any) => ({
                    name: country.name.common,
                    code: country.cca2
                })).sort((a: Country, b: Country) => a.name.localeCompare(b.name));
                setCountries(countryList);
            } catch (error) {
                console.error('Error fetching countries:', error);
            }
        };
        fetchCountries();
    }, []);

    // Fetch rules on component mount and when shop changes
    useEffect(() => {
        if (shop) {
            fetchRules();
        }
    }, [shop]);

    const fetchRules = async () => {
        setIsLoading(true);
        try {
            // Fetch blocklist rules
            const blocklistResponse = await fetch(`/api/access/blocklist?shop=${shop}`);
            if (blocklistResponse.ok) {
                const blocklistData = await blocklistResponse.json();
                const formattedBlocklist = blocklistData.rules.map((rule: any) => ({
                    id: rule.id,
                    type: rule.type,
                    value: rule.value,
                    notes: rule.notes,
                    added: new Date(rule.added).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    }),
                }));
                setBlocklistRules(formattedBlocklist);
            }

            // Fetch allowlist rules
            const allowlistResponse = await fetch(`/api/access/allowlist?shop=${shop}`);
            if (allowlistResponse.ok) {
                const allowlistData = await allowlistResponse.json();
                const formattedAllowlist = allowlistData.rules.map((rule: any) => ({
                    id: rule.id,
                    type: rule.type,
                    value: rule.value,
                    notes: rule.notes,
                    added: new Date(rule.added).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    }),
                }));
                setWhitelistRules(formattedAllowlist);
            }
        } catch (error) {
            console.error('Error fetching rules:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (rule?: Rule) => {
        if (rule) {
            // Edit mode
            setEditingRule(rule);
            setFormData({
                type: rule.type,
                value: rule.value,
                notes: rule.notes || ''
            });
        } else {
            // Add mode
            setEditingRule(null);
            setFormData({ type: '', value: '', notes: '' });
        }
        setCountrySearchQuery('');
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setFormData({ type: '', value: '', notes: '' });
        setEditingRule(null);
        setIsCountryDropdownOpen(false);
        setCountrySearchQuery('');
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        // Reset value when type changes
        if (name === 'type') {
            setFormData(prev => ({ ...prev, value: '' }));
            setCountrySearchQuery('');
        }
    };

    const handleCountrySelect = (countryName: string) => {
        setFormData(prev => ({ ...prev, value: countryName }));
        setIsCountryDropdownOpen(false);
        setCountrySearchQuery('');
    };

    const filteredCountries = countries.filter(country =>
        country.name.toLowerCase().includes(countrySearchQuery.toLowerCase())
    );

    const handleSubmitRule = async () => {
        if (!formData.type || !formData.value) {
            showAlert('error', 'Required Fields Missing', 'Please fill in both Type and Value fields.');
            return;
        }

        setIsSubmitting(true);

        try {
            const endpoint = activeTab === 'blocklist'
                ? `/api/access/blocklist?shop=${shop}`
                : `/api/access/allowlist?shop=${shop}`;

            const method = editingRule ? 'PUT' : 'POST';
            const body = editingRule
                ? {
                    id: editingRule.id,
                    type: formData.type,
                    value: formData.value,
                    notes: formData.notes || undefined,
                }
                : {
                    type: formData.type,
                    value: formData.value,
                    notes: formData.notes || undefined,
                };

            const response = await fetch(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to save rule');
            }

            // Refresh rules from server
            await fetchRules();

            handleCloseModal();

            showAlert(
                'success',
                editingRule ? 'Rule Updated' : 'Rule Added',
                `The ${activeTab} rule has been ${editingRule ? 'updated' : 'added'} successfully.`
            );
        } catch (error: any) {
            console.error('Error saving rule:', error);
            showAlert('error', 'Operation Failed', error.message || 'Failed to save rule. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteRule = async (id: string, listType: 'blocklist' | 'whitelist') => {
        showAlert(
            'confirm',
            'Delete Rule',
            'Are you sure you want to delete this rule? This action cannot be undone.',
            async () => {
                setDeletingId(id);
                hideAlert();

                try {
                    const endpoint = listType === 'blocklist'
                        ? `/api/access/blocklist?shop=${shop}`
                        : `/api/access/allowlist?shop=${shop}`;

                    const response = await fetch(endpoint, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ id }),
                    });

                    if (!response.ok) {
                        const result = await response.json();
                        throw new Error(result.message || 'Failed to delete rule');
                    }

                    // Wait for fade out animation
                    setTimeout(async () => {
                        await fetchRules();
                        setDeletingId(null);
                        showAlert('success', 'Rule Deleted', 'The rule has been deleted successfully.');
                    }, 300);
                } catch (error: any) {
                    console.error('Error deleting rule:', error);
                    showAlert('error', 'Delete Failed', error.message || 'Failed to delete rule. Please try again.');
                    setDeletingId(null);
                }
            }
        );
    };

    const getSummaryCount = (type: Rule['type'], listType: 'blocklist' | 'whitelist') => {
        const rules = listType === 'blocklist' ? blocklistRules : whitelistRules;
        return rules.filter(rule => rule.type === type).length;
    };

    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Sidebar shop={String(shop)} host={String(host)} />

            <main className="flex flex-col w-full items-center py-8 px-20 space-y-8">

                {/* Title */}
                <div className="flex items-center w-full max-w-6xl mx-auto mb-4">
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                        <LucideShieldBan className="text-white" size={20} />
                    </div>
                    <h1 className="ml-4 text-3xl font-bold text-slate-900">
                        Access Control
                    </h1>
                </div>

                <div className="flex w-full max-w-6xl mx-auto border-b border-slate-200 mb-6 bg-black justify-around" style={{ backgroundColor: "rgb(241 245 249 / 1)", borderRadius: '0.5rem' }}>
                    <button
                        className={`w-1/2 flex justify-center items-center px-6 py-3 text-sm font-medium transition-colors text-center ${activeTab === 'blocklist'
                            ? 'bg-white px-20 m-1.5 rounded-lg shadow-md'
                            : 'text-slate-600 hover:text-slate-800'
                            }`}
                        onClick={() => setActiveTab('blocklist')}
                    >
                        <ShieldOff size={20} className="mr-2 text-red-500" />
                        Blocklist ({blocklistRules.length})
                    </button>
                    <button
                        className={`w-1/2 text-center flex items-center px-6 py-3 text-sm font-medium transition-colors justify-center ${activeTab === 'whitelist'
                            ? 'bg-white px-100 m-1.5 rounded-lg shadow-md'
                            : 'text-slate-600 hover:text-slate-800'
                            }`}
                        onClick={() => setActiveTab('whitelist')}
                    >
                        <ShieldCheck size={20} className="mr-2 text-green-500" />
                        Whitelist ({whitelistRules.length})
                    </button>
                </div>

                {/* Blocklist Content */}
                {activeTab === 'blocklist' && (
                    <>
                        <div className="bg-white w-full max-w-6xl mx-auto p-5 shadow-lg rounded-lg">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-slate-800">Blocklist Rules</h2>

                                <button
                                    onClick={() => handleOpenModal()}
                                    className="flex items-center bg-black text-white text-sm font-semibold px-4 py-3 rounded-lg shadow-sm hover:bg-gray-800 transition-colors"
                                >
                                    <CirclePlus size={16} className="mr-2" />
                                    Add Rule
                                </button>
                            </div>
                            <hr className="my-4 border-t border-gray-200" />

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                                <SummaryCard icon={LucideGlobe} title="IP Addresses" count={getSummaryCount('IP Address', 'blocklist')} />
                                <SummaryCard icon={LucideMapPin} title="Countries" count={getSummaryCount('Country', 'blocklist')} />
                                <SummaryCard icon={LucideMail} title="Emails" count={getSummaryCount('Email', 'blocklist')} />
                                <SummaryCard icon={LucidePhone} title="Phones" count={getSummaryCount('Phone', 'blocklist')} />
                                <SummaryCard icon={LucideHome} title="Addresses" count={getSummaryCount('Address', 'blocklist')} />
                            </div>

                            <div className="bg-white rounded-lg overflow-hidden">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
                                    </div>
                                ) : (
                                    <table className="min-w-full divide-y divide-slate-200">
                                        <thead>
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider font">Type</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Value</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Notes</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Added</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {blocklistRules.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-4 text-center font-xs">No items in the list.</td>
                                                </tr>
                                            ) : (
                                                blocklistRules.map((rule) => (
                                                    <tr
                                                        key={rule.id}
                                                        className={`transition-all duration-300 ${deletingId === rule.id
                                                                ? 'opacity-0 scale-95'
                                                                : 'opacity-100 scale-100 animate-fadeIn'
                                                            }`}
                                                    >
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 font-bold">{rule.type}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">{rule.value}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm italic text-slate-500">{rule.notes || '-'}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{rule.added}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => handleOpenModal(rule)}
                                                                    className="inline-flex items-center px-3 py-1.5 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                                                                >
                                                                    <LucideEdit size={14} className="mr-1" />
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteRule(rule.id, 'blocklist')}
                                                                    className="inline-flex items-center px-3 py-1.5 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                                                                >
                                                                    <LucideTrash2 size={14} className="mr-1" />
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* Whitelist Content */}
                {activeTab === 'whitelist' && (
                    <>
                        <div className="bg-white w-full max-w-6xl mx-auto p-5 shadow-lg rounded-lg">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-slate-800">Whitelist Rules</h2>
                                <button
                                    onClick={() => handleOpenModal()}
                                    className="flex items-center bg-black text-white text-sm font-semibold px-4 py-3 rounded-lg shadow-sm hover:bg-gray-800 transition-colors"
                                >
                                    <CirclePlus size={16} className="mr-2" />
                                    Add Rule
                                </button>
                            </div>
                            <hr className="my-4 border-t border-gray-200" />

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                                <SummaryCard icon={LucideGlobe} title="IP Addresses" count={getSummaryCount('IP Address', 'whitelist')} />
                                <SummaryCard icon={LucideMapPin} title="Countries" count={getSummaryCount('Country', 'whitelist')} />
                                <SummaryCard icon={LucideMail} title="Emails" count={getSummaryCount('Email', 'whitelist')} />
                                <SummaryCard icon={LucidePhone} title="Phones" count={getSummaryCount('Phone', 'whitelist')} />
                                <SummaryCard icon={LucideHome} title="Addresses" count={getSummaryCount('Address', 'whitelist')} />
                            </div>

                            <div className="bg-white rounded-lg overflow-hidden">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
                                    </div>
                                ) : (
                                    <table className="min-w-full divide-y divide-slate-200">
                                        <thead >
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Value</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Notes</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Added</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {whitelistRules.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-4 text-center text-slate-500">No whitelist rules added yet.</td>
                                                </tr>
                                            ) : (
                                                whitelistRules.map((rule) => (
                                                    <tr
                                                        key={rule.id}
                                                        className={`transition-all duration-300 ${deletingId === rule.id
                                                                ? 'opacity-0 scale-95'
                                                                : 'opacity-100 scale-100 animate-fadeIn'
                                                            }`}
                                                    >
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 font-bold">{rule.type}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">{rule.value}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm italic text-slate-500">{rule.notes || '-'}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{rule.added}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => handleOpenModal(rule)}
                                                                    className="inline-flex items-center px-3 py-1.5 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                                                                >
                                                                    <LucideEdit size={14} className="mr-1" />
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteRule(rule.id, 'whitelist')}
                                                                    className="inline-flex items-center px-3 py-1.5 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                                                                >
                                                                    <LucideTrash2 size={14} className="mr-1" />
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </>
                )}

            </main>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 animate-scaleIn">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200">
                            <h3 className="text-xl font-bold text-slate-900">
                                {editingRule ? 'Edit' : 'Add'} {activeTab === 'blocklist' ? 'Blocklist' : 'Whitelist'} Rule
                            </h3>
                            <button
                                onClick={handleCloseModal}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <LucideX size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Type Select */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Type
                                </label>
                                <select
                                    name="type"
                                    value={formData.type}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Select a rule type</option>
                                    <option value="IP Address">IP Address</option>
                                    <option value="Country">Country</option>
                                    <option value="Email">Email</option>
                                    <option value="Phone">Phone</option>
                                    <option value="Address">Address</option>
                                </select>
                            </div>

                            {/* Value Input - Country Dropdown or Text Input */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Value
                                </label>
                                {formData.type === 'Country' ? (
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left bg-white flex items-center justify-between"
                                        >
                                            <span className={formData.value ? 'text-slate-900' : 'text-slate-400'}>
                                                {formData.value || 'Select country...'}
                                            </span>
                                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {isCountryDropdownOpen && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
                                                <div className="p-2 border-b border-slate-200">
                                                    <div className="relative">
                                                        <LucideSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                                                        <input
                                                            type="text"
                                                            placeholder="Search country..."
                                                            value={countrySearchQuery}
                                                            onChange={(e) => setCountrySearchQuery(e.target.value)}
                                                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="overflow-y-auto max-h-48">
                                                    {filteredCountries.length > 0 ? (
                                                        filteredCountries.map((country) => (
                                                            <button
                                                                key={country.code}
                                                                type="button"
                                                                onClick={() => handleCountrySelect(country.name)}
                                                                className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm text-slate-700 transition-colors"
                                                            >
                                                                {country.name}
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className="px-4 py-2 text-sm text-slate-500">No countries found</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        name="value"
                                        value={formData.value}
                                        onChange={handleInputChange}
                                        placeholder="e.g., 127.0.0.1, john@email.com..."
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                )}
                            </div>

                            {/* Notes Textarea */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Notes
                                </label>
                                <textarea
                                    name="notes"
                                    value={formData.notes}
                                    onChange={handleInputChange}
                                    placeholder="Optional notes..."
                                    rows={4}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
                            <button
                                onClick={handleCloseModal}
                                disabled={isSubmitting}
                                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitRule}
                                disabled={isSubmitting}
                                className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? (editingRule ? 'Updating...' : 'Adding...') : (editingRule ? 'Update Rule' : 'Add Rule')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Alert Modal */}
            {alert.show && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 animate-scaleIn">
                        {/* Alert Header */}
                        <div className={`flex items-center gap-3 p-6 border-b ${alert.type === 'error' ? 'border-red-200 bg-red-50' :
                                alert.type === 'success' ? 'border-green-200 bg-green-50' :
                                    'border-slate-200'
                            }`}>
                            {alert.type === 'error' && (
                                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </div>
                            )}
                            {alert.type === 'success' && (
                                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            )}
                            {alert.type === 'confirm' && (
                                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                            )}
                            <div className="flex-1">
                                <h3 className={`text-lg font-bold ${alert.type === 'error' ? 'text-red-900' :
                                        alert.type === 'success' ? 'text-green-900' :
                                            'text-slate-900'
                                    }`}>
                                    {alert.title}
                                </h3>
                            </div>
                        </div>

                        {/* Alert Body */}
                        <div className="p-6">
                            <p className="text-slate-600 text-sm leading-relaxed">
                                {alert.message}
                            </p>
                        </div>

                        {/* Alert Actions */}
                        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
                            {alert.type === 'confirm' ? (
                                <>
                                    <button
                                        onClick={hideAlert}
                                        className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (alert.onConfirm) {
                                                alert.onConfirm();
                                            }
                                        }}
                                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                                    >
                                        Delete
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={hideAlert}
                                    className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    OK
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes scaleIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }

                .animate-fadeIn {
                    animation: fadeIn 0.3s ease-in-out;
                }

                .animate-scaleIn {
                    animation: scaleIn 0.2s ease-out;
                }
            `}</style>

        </div>

    );
};

export default AccessControlPage;