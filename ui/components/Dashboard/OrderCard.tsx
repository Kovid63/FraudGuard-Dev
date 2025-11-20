import React, { useEffect, useRef, useState } from 'react';
import { Globe, Home, LucideCalendar, LucideChevronDown, LucideChevronUp, LucideCircleCheckBig, LucideCircleX, LucideDollarSign, LucideEllipsisVertical, LucideMail, LucideMapPin, LucidePackage, LucideShield, LucideShieldAlert, LucideShieldOff, LucideUser, Mail, MapPin, Phone, X } from "lucide-react";
import { sendVerificationEmail } from '../../../utils/verification';
import { toast } from 'react-toastify';

export default function OrderCard({ order, idx, visible, isTabTransitioning, selected, onCheckboxChange, shop, onResendEmail, onCapturePayment, onCancelOrder, activeTab, showRemark }: {
  order: any,
  idx: number,
  visible: boolean,
  isTabTransitioning: boolean,
  selected: boolean,
  onCheckboxChange: (checked: boolean) => void,
  shop: string,
  onResendEmail: () => void,
  onCapturePayment: (orderId: string) => Promise<void>,
  onCancelOrder: (orderId: string) => Promise<void>,
  activeTab: string,
  showRemark: boolean
}) {

  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isCapturingPayment, setIsCapturingPayment] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  const listOptions = [
    {
      id: 'Email',
      label: 'Email Address',
      value: order.email,
      icon: <Mail className="w-4 h-4 text-gray-600" />
    },
    {
      id: 'IP Address',
      label: 'Order IP Address',
      value: order.browser_ip,
      icon: <Globe className="w-4 h-4 text-gray-600" />
    },
    {
      id: 'Country',
      label: 'Country',
      value: order.billing_address?.country,
      icon: <MapPin className="w-4 h-4 text-gray-600" />
    },
    {
      id: 'Phone',
      label: 'Phone Number',
      value: order.billing_address?.phone || order.customer?.phone || 'Not provided',
      icon: <Phone className="w-4 h-4 text-gray-600" />,
      disabled: !order.billing_address?.phone && !order.customer?.phone
    },
    {
      id: 'Address',
      label: 'Billing Address',
      value: `${order.billing_address?.address1}, ${order.billing_address?.city}, ${order.billing_address?.province || ''} ${order.billing_address?.zip}`,
      icon: <Home className="w-4 h-4 text-gray-600" />
    }
  ];

  const handleResendEmail = async () => {
    setIsSendingEmail(true);
    try {
      const res = await sendVerificationEmail(order, shop);

      if (res.success) {
        toast.success(`Verification email sent to ${order.email} for order ${order.name}`);
        onResendEmail();
      } else {
        toast.error(`${res.message} for order ${order.name}`);
      }
    } catch (error) {
      toast.error(`Error sending verification email: ${error}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleCapturePayment = async () => {
    console.log('OrderCard: Starting capture payment for order:', order.id);
    setIsCapturingPayment(true);
    try {
      await onCapturePayment(order.id);
      console.log('OrderCard: Capture payment completed successfully');
      toast.success(`Payment captured for order ${order.order_number}`);
    } catch (error) {
      console.error('OrderCard: Error capturing payment:', error);
      console.error('OrderCard: Error type:', typeof error);
      console.error('OrderCard: Error constructor:', error?.constructor?.name);
      console.error('OrderCard: Error keys:', Object.keys(error || {}));

      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        if (error.message) {
          errorMessage = error.message;
        } else if (error.error) {
          errorMessage = error.error;
        } else if (error.errors) {
          errorMessage = JSON.stringify(error.errors);
        } else {
          errorMessage = JSON.stringify(error);
        }
      } else {
        errorMessage = String(error);
      }

      toast.error(`Error capturing payment: ${errorMessage}`);
    } finally {
      console.log('OrderCard: Setting isCapturingPayment to false');
      setIsCapturingPayment(false);
    }
  };

  const handleCancelOrder = async () => {
    console.log('OrderCard: Starting cancel order for order:', order.id);
    setIsCancellingOrder(true);
    try {
      await onCancelOrder(order.id);
      console.log('OrderCard: Cancel order completed successfully');
      toast.success(`Order cancelled for order ${order.order_number}`);
    } catch (error) {
      console.error('OrderCard: Error cancelling order:', error);
      console.error('OrderCard: Error type:', typeof error);
      console.error('OrderCard: Error constructor:', error?.constructor?.name);
      console.error('OrderCard: Error keys:', Object.keys(error || {}));

      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        if (error.message) {
          errorMessage = error.message;
        } else if (error.error) {
          errorMessage = error.error;
        } else if (error.errors) {
          errorMessage = JSON.stringify(error.errors);
        } else {
          errorMessage = JSON.stringify(error);
        }
      } else {
        errorMessage = String(error);
      }

      toast.error(`Error cancelling order: ${errorMessage}`);
    } finally {
      console.log('OrderCard: Setting isCancellingOrder to false');
      setIsCancellingOrder(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCheckboxChange = (value: string) => {
    setSelectedItems(prev =>
      prev.includes(value)
        ? prev.filter(item => item !== value)
        : [...prev, value]
    );
  };

  const handleManageAccessLists = () => {
    setIsModalOpen(true);
    setIsDropdownOpen(false);
    setNotes(`From order ${order.name}`);
    setSelectedItems([]);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleWhitelistSelected = async () => {
    if (selectedItems.length === 0) return;

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const promises = selectedItems.map(async (itemId) => {
        const option = listOptions.find(opt => opt.id === itemId);
        if (!option || option.disabled) return null;

        const response = await fetch(`/api/access/allowlist?shop=${shop}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: itemId,
            value: option.value,
            notes: notes || `From order ${order.name}`
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to add to allowlist');
        }

        return data;
      });

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r !== null).length;
      
      setSuccessMessage(`Successfully added ${successCount} item(s) to allowlist`);
      toast.success(`Successfully added ${successCount} item(s) to allowlist`);
      
      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedItems([]);
        setSuccessMessage('');
        setNotes('');
      }, 2000);

    } catch (error) {
      console.error('Error adding to allowlist:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to add items to allowlist';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBlocklistSelected = async () => {
    if (selectedItems.length === 0) return;

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const promises = selectedItems.map(async (itemId) => {
        const option = listOptions.find(opt => opt.id === itemId);
        if (!option || option.disabled) return null;

        const response = await fetch(`/api/access/blocklist?shop=${shop}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: itemId,
            value: option.value,
            notes: notes || `From order ${order.name}`
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to add to blocklist');
        }

        return data;
      });

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r !== null).length;
      
      setSuccessMessage(`Successfully added ${successCount} item(s) to blocklist`);
      toast.success(`Successfully added ${successCount} item(s) to blocklist`);
      
      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedItems([]);
        setSuccessMessage('');
        setNotes('');
      }, 2000);

    } catch (error) {
      console.error('Error adding to blocklist:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to add items to blocklist';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex mb-4">
      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">
                Manage Lists for Order {order.name}
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedItems([]);
                  setErrorMessage('');
                  setSuccessMessage('');
                  setNotes('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={isLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <p className="text-sm font-semibold text-gray-900 mb-4">
                Select information to add to a list:
              </p>

              {/* Checkbox List */}
              <div className="space-y-3 mb-6">
                {listOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors ${
                      option.disabled || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(option.id)}
                      onChange={() => handleCheckboxChange(option.id)}
                      disabled={option.disabled || isLoading}
                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {option.icon}
                        <span className="text-sm font-medium text-gray-900">
                          {option.label}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 break-all">
                        {option.value}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              {/* Notes Section */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 border outline-none border-gray-300 rounded-lg focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-sm disabled:opacity-50 disabled:bg-gray-50"
                  rows={4}
                  placeholder={`From order ${order.name}`}
                />
              </div>

              {/* Error/Success Messages */}
              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{errorMessage}</p>
                </div>
              )}
              
              {successMessage && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">{successMessage}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedItems([]);
                    setErrorMessage('');
                    setSuccessMessage('');
                    setNotes('');
                  }}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleWhitelistSelected}
                    disabled={selectedItems.length === 0 || isLoading}
                    className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isLoading && (
                      <svg className="animate-spin h-4 w-4 text-green-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    Whitelist Selected
                  </button>
                  <button
                    onClick={handleBlocklistSelected}
                    disabled={selectedItems.length === 0 || isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isLoading && (
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    Blocklist Selected
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`transition-all duration-300
          ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}
          ${isTabTransitioning ? "opacity-0 -translate-y-4 pointer-events-none" : ""}
        `}
        style={{ transitionDelay: `${idx * 100}ms` }}
      >
        {activeTab === "On Hold" && <input
          type="checkbox"
          className="mr-2 w-4 h-4"
          checked={selected}
          onChange={e => onCheckboxChange(e.target.checked)}
        />}
      </div>
      <div
        className={`bg-white w-full rounded-lg shadow ml-2 border-gray-100 p-6 mb-6 transition-all duration-300
          ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}
          ${isTabTransitioning ? "opacity-0 -translate-y-4 pointer-events-none" : ""}
        `}
        style={{ transitionDelay: `${idx * 100}ms` }}
      >
        <div className="flex w-full justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-slate-900">{`#FG-${order?.order_number}`}</span>
            <div className="h-4 w-1 bg-gray-300 rounded-sm" />
            <span className="text-gray-700 text-sm flex items-center gap-1">
              <LucideUser className="w-4 h-4 text-gray-500" />
              <span className="ml-1 font-medium text-[16px]">{`${order?.customer?.first_name?.split(" ")
                ?.map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                ?.join(" ") || ''} ${order?.customer?.last_name?.split(" ")
                  ?.map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                  ?.join(" ") || ''}`}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <LucideMapPin className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-[16px]">{`${order?.billing_address?.country || 'Unknown'}`}</span>
            <div className="h-4 w-1 bg-gray-300 rounded-sm" />
            <LucideCalendar className="w-4 h-4 text-gray-500" />
            <span className="text-slate-900 text-[14px]">{`${new Date(order?.processed_at?.split("T")[0] || new Date()).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric"
            })}`}</span>

            <div className="relative ml-3" ref={dropdownRef}>
              <div
                className="border p-1 rounded-md border-gray-300 cursor-pointer hover:bg-gray-100 transition-all duration-300"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <LucideEllipsisVertical className='w-5 h-5 text-gray-800 hover:text-gray-600' />
              </div>

              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                  <div className="py-1">
                    <button 
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-900 hover:bg-gray-100 transition-colors"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        handleResendEmail();
                      }}
                    >
                      <LucideMail className="w-4 h-4" />
                      Resend Verification Email
                    </button>
                    <button 
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-900 hover:bg-gray-100 transition-colors" 
                      onClick={handleManageAccessLists}
                    >
                      <LucideShieldOff className="w-4 h-4" />
                      Manage Access Lists
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex w-full justify-between mt-2">
          <div className='flex items-center gap-2'>
            <LucideDollarSign className='w-4 h-4 text-gray-500' />
            <span className='text-slate-900 font-medium text-md'>{`$${order?.total_price || '0'} ${order?.currency || 'USD'}`}</span>
          </div>
        </div>

        <div className='flex w-full justify-between mt-3'>
          <div className='flex items-center gap-2'>
            <LucideShield className='w-4 h-4 text-slate-900' />
            <span className='text-slate-900 font-medium text-md'>{`Status`}</span>
          </div>
        </div>

        <div className='flex w-full justify-between mt-3'>
          <div className='flex items-center gap-2'>
            {(() => {
              const risk = order?.guard?.riskLevel?.score >= 85
                ? 'high'
                : order?.guard?.riskLevel?.score >= 70
                  ? 'high-medium'
                  : order?.guard?.riskLevel?.score >= 55
                    ? 'medium'
                    : order?.guard?.riskLevel?.score >= 40
                      ? 'low-medium'
                      : 'low';

              let iconColor = 'text-yellow-600';
              let bgColor = 'bg-yellow-50';
              let borderColor = 'border-yellow-300';
              let textColor = 'text-yellow-700';

              if (risk === 'high') {
                iconColor = 'text-red-600';
                bgColor = 'bg-red-50';
                borderColor = 'border-red-300';
                textColor = 'text-red-700';
              } else if (risk === 'high-medium') {
                iconColor = 'text-orange-600';
                bgColor = 'bg-orange-50';
                borderColor = 'border-orange-300';
                textColor = 'text-orange-700';
              } else if (risk === 'medium') {
                iconColor = 'text-yellow-600';
                bgColor = 'bg-yellow-50';
                borderColor = 'border-yellow-300';
                textColor = 'text-yellow-700';
              } else if (risk === 'low-medium') {
                iconColor = 'text-yellow-600';
                bgColor = 'bg-yellow-50';
                borderColor = 'border-yellow-300';
                textColor = 'text-yellow-700';
              } else if (risk === 'low') {
                iconColor = 'text-blue-600';
                bgColor = 'bg-blue-50';
                borderColor = 'border-blue-300';
                textColor = 'text-blue-700';
              }

              return (
                <>
                  <LucideShield className={`w-4 h-4 ${iconColor}`} />
                  <div className={`flex ${bgColor} rounded-full border ${borderColor} items-center px-3`}>
                    <span className={`${textColor} font-semibold text-[12px]`}>{`FraudGuard: `}</span>
                    <span className={`${textColor} font-semibold text-[12px] ml-1`}>{`${order?.guard?.riskLevel?.score >= 85 ? 'HIGH' : order?.guard?.riskLevel?.score >= 70 ? 'HIGH-MEDIUM' : order?.guard?.riskLevel?.score >= 55 ? 'MEDIUM' : order?.guard?.riskLevel?.score >= 40 ? 'LOW-MEDIUM' : 'LOW'} RISK (${order?.guard?.riskLevel?.score || 0}/100)`}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className='flex w-full justify-between mt-3'>
          <div className='flex items-center gap-2'>
            <div className='flex rounded-full border border-gray-300 items-center px-3'>
              <span className='text-gray-600 font-semibold text-[12px]'>{`Shopify: `}</span>
              <span className='text-gray-600 font-semibold text-[12px] ml-1'>{`${order?.guard?.shopifyRisk?.assessments?.[0]?.riskLevel?.toUpperCase() === "NONE" ? "LOW RISK" : order?.guard?.shopifyRisk?.assessments?.[0]?.riskLevel?.toUpperCase() + ' RISK' || 'LOW RISK'}`}</span>
            </div>
          </div>
        </div>

        <div className='flex w-full mt-3'>
          <div className='flex items-center gap-2'>
            <div className={`flex rounded-full border items-center px-3 ${order?.guard?.status === 'verified' || order?.guard?.remark === 'verified'
              ? 'bg-green-50 border-green-300'
              : order?.guard?.status === 'unverified' || order?.guard?.remark === 'unverified'
                ? 'bg-red-50 border-red-300'
                : 'bg-yellow-50 border-yellow-300'
              }`}>
              <span className={`font-semibold text-[12px] ${order?.guard?.status === 'verified' || order?.guard?.remark === 'verified'
                ? 'text-green-700'
                : order?.guard?.status === 'unverified' || order?.guard?.remark === 'unverified'
                  ? 'text-red-700'
                  : 'text-yellow-700'
                }`}>{`Verification: `}</span>
              <span className={`font-semibold text-[12px] ml-1 ${order?.guard?.status === 'verified' || order?.guard?.remark === 'verified'
                ? 'text-green-700'
                : order?.guard?.status === 'unverified' || order?.guard?.remark === 'unverified'
                  ? 'text-red-700'
                  : 'text-yellow-700'
                }`}>
                {showRemark && order.guard?.remark?.length > 0 ? (
                  <>
                    {order.guard?.remark?.split(" ")
                      ?.map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                      ?.join(" ")} {" "}
                  </>
                ) : ['verified', 'unverified'].includes(order?.guard?.status) ? (
                  order?.guard?.status
                    ?.split(" ")
                    ?.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    ?.join(" ") || 'Pending'
                ) : (
                  'Pending '
                )
                }
                (
                {order?.guard?.email?.lastSentAt ? (
                  (() => {
                    let timeAgo;

                    if (typeof order?.guard?.email?.lastSentAt === "number") {
                      const days = order?.guard?.email?.lastSentAt;
                      timeAgo =
                        days === 0
                          ? "today"
                          : days === 1
                            ? "1 day ago"
                            : `${days} days ago`;
                    } else {
                      const lastSentDate = new Date(order?.guard?.email?.lastSentAt || new Date());
                      const now = new Date();
                      const diffTime = Math.abs(now.getTime() - lastSentDate.getTime());

                      const seconds = Math.floor(diffTime / 1000);
                      const minutes = Math.floor(diffTime / (1000 * 60));
                      const hours = Math.floor(diffTime / (1000 * 60 * 60));
                      const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                      if (seconds < 60) {
                        timeAgo = seconds === 1 ? "1 second ago" : `${seconds} seconds ago...`;
                      } else if (minutes < 60) {
                        timeAgo = minutes === 1 ? "1 minute ago" : `${minutes} minutes ago...`;
                      } else if (hours < 24) {
                        timeAgo = hours === 1 ? "1 hour ago" : `${hours} hours ago...`;
                      } else {
                        timeAgo = days === 1 ? "1 day ago" : `${days} days ago...`;
                      }
                    }

                    return (
                      <>
                        Email sent{" "}
                        {timeAgo}
                      </>
                    );
                  })()
                ) : (
                  <>
                    No email sent
                  </>
                )}
                )
              </span>

            </div>
          </div>
          <button
            className='flex rounded-md py-[0.1rem] border border-blue-300 items-center px-[0.5rem] ml-4 cursor-pointer hover:bg-blue-50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed'
            onClick={handleResendEmail}
            disabled={isSendingEmail}
          >
            <span className='text-blue-600 font-semibold text-[12px] hover:text-black'>
              {isSendingEmail ? 'Sending...' : 'Resend Email'}
            </span>
          </button>
        </div>

        <div className={`flex w-full justify-center items-center mt-5 transition-all duration-500 ease-in-out ${!showFullAnalysis
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}>
          <div
            className='flex items-center gap-4 cursor-pointer hover:bg-gray-100 rounded-md px-4 py-2 hover:text-blue-800 transition-all duration-300'
            onClick={() => setShowFullAnalysis(true)}
          >
            <span className='text-blue-600 font-semibold text-[14px] cursor-pointer hover:text-blue-800'>Show Full Order Analysis</span>
            <LucideChevronDown className='w-4 h-4 text-blue-600' />
          </div>
        </div>

        <div className={`flex flex-col w-full mt-5 transition-all duration-500 ease-in-out ${showFullAnalysis
          ? 'opacity-100 max-h-[2000px] overflow-visible'
          : 'opacity-0 max-h-0 overflow-hidden'
          }`}>
          <div className='flex w-full items-center'>
            <div className='flex w-full border-b border-gray-100 rounded-full' />
          </div>
          <div className='flex items-center gap-2 mt-4'>
            <LucideCircleCheckBig className='w-4 h-4 text-blue-600' />
            <span className='font-semibold text-[16px]'>Recommendation</span>
          </div>
          <div className='flex flex-col w-full mt-4 bg-blue-50 rounded-md p-4 border border-blue-200'>
            <span className='text-blue-900 font-semibold text-[16px] mt-1'>{order?.guard?.riskLevel?.recommendation || 'No recommendation available'}</span>
            <span className='font-medium text-blue-700 text-[12px] mt-1'>Risk Score: {order?.guard?.riskLevel?.score || 0}/100</span>
          </div>
          <div className='flex w-full items-center'>
            {/* Indicators */}
            <div className='flex flex-col w-full'>
              {/* Indicator heading */}
              <div className='flex items-center gap-2 mt-5'>
                <LucideCircleX className='w-4 h-4 text-red-600' />
                <span className='font-semibold text-[14px]'>Risk Indicators {`(${(order?.guard?.riskLevel?.reason?.length || 0) + (order?.guard?.shopifyRisk?.assessments?.[0]?.facts?.filter((item: any) => item.sentiment === "NEGATIVE")?.length || 0)})`}</span>
              </div>
              {/* Indicator list */}
              <div className='flex w-full mt-2'>
                <div>
                  {
                    order?.guard?.riskLevel?.reason?.map((item: any) => (
                      <div className='flex items-center'>
                        <div className='flex h-6 w-[0.1rem] bg-red-100 rounded-lg transition-all duration-600' />
                        <div className='flex h-[6px] w-[6px] bg-red-400 rounded-full ml-6' />
                        <span className='text-red-700 text-[14px] ml-3'>{item}</span>
                      </div>
                    ))
                  }
                </div>

              </div>

              {/* Indicator list */}

              {order?.guard?.shopifyRisk?.assessments?.[0]?.facts?.filter((item: any) => item.sentiment === "NEGATIVE")?.length > 0 && <div className='flex w-full mt-2'>
                <div>
                  {
                    order?.guard?.shopifyRisk?.assessments?.[0]?.facts?.filter((item: any) => item.sentiment === "NEGATIVE")?.map((item: any) => (
                      <div className='flex items-center'>
                        <div className='flex h-6 w-[0.1rem] bg-blue-100 rounded-lg transition-all duration-600' />
                        <div className='flex h-[6px] w-[6px] bg-blue-400 rounded-full ml-6' />
                        <span className='text-blue-700 text-[14px] ml-3'>Shopify: {item.description}</span>
                      </div>
                    ))
                  }
                </div>

              </div>
              }
            </div>


          </div>

          {/* Natural trust signals */}

          {order?.guard?.riskLevel?.trust?.length > 0 && <div className='flex w-full items-center'>

            <div className='flex flex-col w-full'>

              <div className='flex items-center gap-2 mt-5'>
                <LucideCircleCheckBig className='w-4 h-4 text-green-600' />
                <span className='font-semibold text-[14px]'>Natural Trust Signals {`(${order?.guard?.riskLevel?.trust?.length || 0})`}</span>
              </div>

              <div className='flex w-full mt-2'>
                <div>
                  {
                    order?.guard?.riskLevel?.trust?.map((item) => (
                      <div className='flex items-center'>
                        <div className='flex h-6 w-[0.1rem] bg-green-100 rounded-lg transition-all duration-600' />
                        <div className='flex h-[6px] w-[6px] bg-green-400 rounded-full ml-6' />
                        <span className='text-green-700 text-[14px] ml-3'>{item}</span>
                      </div>
                    ))
                  }
                </div>

              </div>

            </div>

          </div>}

          <div className='flex w-full items-center'>
            {/* Indicators */}
            <div className='flex flex-col w-full'>
              {/* Indicator heading */}
              <div className='flex items-center gap-2 mt-5'>
                <LucidePackage className='w-4 h-4 text-black' />
                <span className='font-semibold text-[14px]'>Products Ordered {`(${order?.line_items?.length || 0})`}</span>
              </div>
              {/* Indicator list */}
              <div className='flex w-full mt-2'>
                <div className='flex flex-col w-full'>
                  {
                    order?.line_items?.map((item: any) => (
                      <div className='flex w-full items-center'>
                        <div className='flex h-7 w-[0.1rem] bg-slate-600 rounded-lg transition-all duration-600 mb-[-1px]' />
                        <div className='flex items-center justify-between w-full'>
                          <span className='text-slate-700 text-[14px] ml-6 mb-1'>{item?.name || 'Unknown Product'}</span>
                          <div className='bg-slate-100 px-2 rounded-md'>
                            <span className='text-slate-700 font-mono text-[12px]'>{`Qty: ${item?.quantity || 0}`}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>

              </div>

            </div>

          </div>

          {/* Note */}
          <div className='flex w-full items-center mt-5 bg-gray-50 rounded-md px-4 py-2 border border-gray-200'>
            <span className='text-gray-600 text-[12px] italic'>Note that even verification does not guarantee full security. The final order approval decision is the business owner's responsibility.</span>
          </div>
        </div>

        <div className={`flex w-full justify-center items-center mt-5 transition-all duration-500 ease-in-out ${showFullAnalysis
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-4 pointer-events-none mt-[-60px]'
          }`}>
          <div
            className='flex items-center gap-4 cursor-pointer hover:bg-gray-100 rounded-md px-4 py-2 hover:text-blue-800 transition-all duration-300'
            onClick={() => setShowFullAnalysis(false)}
          >
            <span className='text-blue-600 font-semibold text-[14px] cursor-pointer hover:text-blue-800'>Hide Details</span>
            <LucideChevronUp className='w-4 h-4 text-blue-600' />
          </div>
        </div>

        <div className='flex w-full items-center mt-4'>
          <div className='flex w-full border-b border-gray-100 rounded-full' />
        </div>

        <div className='flex w-full items-center justify-evenly mt-4'>
          {activeTab === "Approved" || (activeTab === "All Orders" && order?.guard?.status === "captured payment") ? (
            <div className="flex w-full items-center justify-center">
              <div className="flex bg-gray-200 w-full justify-center text-gray-700 px-4 py-2 rounded-md font-medium text-[14px]">
                Order Captured
              </div>
            </div>
          ) : activeTab === "Cancelled" || (activeTab === "All Orders" && order?.guard?.status === "cancelled payment") ? (
            <div className="flex w-full items-center justify-center">
              <div className="flex bg-gray-200 w-full justify-center text-gray-700 px-4 py-2 rounded-md font-medium text-[14px]">
                Order Cancelled
              </div>
            </div>
          ) : (
            <>
              <button
                className={`px-4 py-2 rounded-md w-1/2 font-semibold text-[14px] cursor-pointer transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isCapturingPayment
                  ? 'bg-gray-600 text-white'
                  : 'bg-black text-white hover:bg-slate-800'
                  }`}
                onClick={handleCapturePayment}
                disabled={isCapturingPayment}
              >
                {isCapturingPayment && (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                )}
                {isCapturingPayment ? 'Capturing...' : 'Capture Payment'}
              </button>
              <button
                className={`px-4 py-2 w-1/2 items-center justify-center border border-red-200 rounded-md mx-4 cursor-pointer transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex gap-2 ${isCancellingOrder
                  ? 'bg-red-100 text-red-700'
                  : 'hover:bg-red-50 text-red-600'
                  }`}
                onClick={handleCancelOrder}
                disabled={isCancellingOrder}
              >
                {isCancellingOrder && (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent"></div>
                )}
                <LucideCircleX className='w-4 h-4' />
                <span className='font-semibold text-[14px]'>
                  {isCancellingOrder ? 'Cancelling...' : 'Cancel'}
                </span>
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}