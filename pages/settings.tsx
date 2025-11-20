import React, { useEffect, useState } from 'react'
import Sidebar from '../ui/components/Sidebar'
import { useRouter } from 'next/router';
import { IoIosArrowDown } from 'react-icons/io';
import { MdClose } from 'react-icons/md';
import { LucideChevronDown, LucideCircleCheck, LucideCircleCheckBig, LucideInfo, LucideMail, LucideSettings, LucideShield, LucideTriangleAlert } from 'lucide-react';
import { createApp } from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';

const Settings = () => {
  const router = useRouter();
  const { shop, onboarding, host } = router.query;

  // --- SettingsPanel logic ---
  const [flagRiskLevel, setFlagRiskLevel] = useState('high+medium');
  const [autoCancelHighRisk, setAutoCancelHighRisk] = useState(false);
  const [autoCancelUnverified, setAutoCancelUnverified] = useState(false);
  const [autoApproveVerified, setAutoApproveVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualCaptureStatus, setManualCaptureStatus] = useState(false);
  const [emailContent, setEmailContent] = useState({
    from: '',
    subject: '',
    body: ''
  });
  const [shopName, setShopName] = useState('');

  // Per-action loading states
  const [manualCaptureLoading, setManualCaptureLoading] = useState(false);
  const [flagRiskLoading, setFlagRiskLoading] = useState(false);
  const [autoCancelUnverifiedLoading, setAutoCancelUnverifiedLoading] = useState(false);
  const [autoApproveVerifiedLoading, setAutoApproveVerifiedLoading] = useState(false);
  const [autoCancelHighRiskLoading, setAutoCancelHighRiskLoading] = useState(false);

  // --- UI state ---
  const [showVerificationPreviewModal, setShowVerificationPreviewModal] = useState(false);
  const [isFlagOptionsOpen, setIsFlagOptionsOpen] = useState(false);

  // Dropdown options for flag risk level
  const flagOptions = [
    { label: 'High only', value: 'high' },
    { label: 'High and Medium', value: 'high+medium' }
  ];

  const app = createApp({
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!,
    host: host as string || 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvdXZzemgxLW01',
    forceRedirect: true,
  });

  // --- SettingsPanel handlers ---
  const fetchSettings = async () => {
    setLoading(true);
    try {
      if (!shop || typeof shop !== 'string') return;
      const res = await fetch(`/api/settings/risk-settings?shop=${encodeURIComponent(shop)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch risk settings');
      }
      const data = await res.json();
      if (!data) {
        setFlagRiskLevel('high+medium');
        setAutoCancelHighRisk(false);
        setAutoCancelUnverified(false);
        setAutoApproveVerified(false);
        return;
      }
      if (data.flagHighRisk && data.flagMediumRisk) setFlagRiskLevel('high+medium');
      else if (data.flagHighRisk && !data.flagMediumRisk) setFlagRiskLevel('high');
      else if (!data.flagHighRisk && data.flagMediumRisk) setFlagRiskLevel('medium');
      setAutoCancelHighRisk(data.autoCancelHighRisk || false);
      setAutoCancelUnverified(data.autoCancelUnverified || false);
      setAutoApproveVerified(data.autoApproveVerified || false);
    } catch (err) {
      setError(err.message);
      setFlagRiskLevel('high+medium');
      setAutoCancelHighRisk(false);
      setAutoCancelUnverified(false);
      setAutoApproveVerified(false);
    } finally {
      setLoading(false);
    }
  };

  const updateFlagRiskLevel = async (newLevel) => {
    setFlagRiskLoading(true);
    setError('');
    try {
      if (!shop || typeof shop !== 'string') return;
      const res = await fetch('/api/settings/risk-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-shopify-shop-domain': shop
        },
        body: JSON.stringify({ settingType: 'flag', riskLevel: newLevel, shop }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update risk settings');
      }
      setFlagRiskLevel(newLevel);
    } catch (err) {
      setError(err.message);
    } finally {
      setFlagRiskLoading(false);
    }
  };

  // const handleAutoActionChange = async (action, value) => {
  //   if (!shop || typeof shop !== 'string') return;
  //   let setLoadingFn;
  //   if (action === 'autoCancelHighRisk') setLoadingFn = setAutoCancelHighRiskLoading;
  //   else if (action === 'autoCancelUnverified') setLoadingFn = setAutoCancelUnverifiedLoading;
  //   else if (action === 'autoApproveVerified') setLoadingFn = setAutoApproveVerifiedLoading;
  //   else setLoadingFn = () => { };
  //   setLoadingFn(true);
  //   const prevValue =
  //     action === 'autoCancelHighRisk' ? autoCancelHighRisk :
  //       action === 'autoCancelUnverified' ? autoCancelUnverified :
  //         autoApproveVerified;
  //   // Optimistically update the UI
  //   if (action === 'autoCancelHighRisk') setAutoCancelHighRisk(value);
  //   else if (action === 'autoCancelUnverified') setAutoCancelUnverified(value);
  //   else if (action === 'autoApproveVerified') setAutoApproveVerified(value);
  //   // Send update to server
  //   try {
  //     await fetch('/api/settings/risk-settings', {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'x-shopify-shop-domain': shop
  //       },
  //       body: JSON.stringify({ settingType: 'autoAction', riskLevel: value, actionType: action, shop }),
  //     });
  //   } catch (err) {
  //     // Revert to previous state if there's an error
  //     if (action === 'autoCancelHighRisk') setAutoCancelHighRisk(prevValue);
  //     else if (action === 'autoCancelUnverified') setAutoCancelUnverified(prevValue);
  //     else if (action === 'autoApproveVerified') setAutoApproveVerified(prevValue);
  //   } finally {
  //     setLoadingFn(false);
  //   }
  // };

  const getManualCaptureStatus = async () => {
    if (!shop || typeof shop !== 'string') return;
    const response = await fetch(`/api/shop/onboarding?shop=${encodeURIComponent(shop)}`);
    const data = await response.json();
    if (!data.result?.manualCaptureEnabled) setManualCaptureStatus(false);
    setManualCaptureStatus(data.result?.manualCaptureEnabled);
  };

  const updateManualCaptureStatus = async (value) => {
    if (!shop || typeof shop !== 'string') return;
    setManualCaptureLoading(true);
    const response = await fetch(`/api/shop/onboarding?shop=${encodeURIComponent(shop)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ manualCaptureEnabled: value })
    });
    const data = await response.json();
    if (!data.result?.manualCaptureEnabled) setManualCaptureStatus(false);
    setManualCaptureStatus(data.result?.manualCaptureEnabled);
    if (host && typeof host === 'string') {
      router.replace('/settings?shop=' + encodeURIComponent(shop) + '&host=' + encodeURIComponent(host));
    }
    setManualCaptureLoading(false);
  };

  useEffect(() => {
    if (shop) {
      fetchSettings();
      getManualCaptureStatus();
    }
  }, [shop, manualCaptureStatus]);

  async function getActualShopName(shopUrl: string) {
    try {
      const response = await fetch(`/api/shop/shop-name?shop=${shopUrl}`);
      const data = await response.json();
      return data.name;
    } catch (error) {
      console.error('Error fetching shop name:', error);
      return 'Shop name not found';
    }
  }

  const completeOnboarding = async () => {
    // Validate shop parameter
    if (!shop) {
      setError('Missing shop parameter. Please refresh the page.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await fetch(`/api/shop/onboarding?shop=${encodeURIComponent(shop as string)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ onboardingComplete: true })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server responded with status: ${response.status}`);
      }

      setLoading(false);
      if (host && typeof host === 'string') {
        const redirect = Redirect.create(app);
        redirect.dispatch(Redirect.Action.REMOTE, `https://admin.shopify.com/store/${String(shop).split('.')[0]}/settings/payments`);
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      setError(err.message || 'Failed to complete onboarding. Please try again.');
      setLoading(false);
    }
  }


  useEffect(() => {
    if (!shopName) return;

    const handler = (e) => {
      if (e.target?.id === 'trigger-verification-preview') {
        setShowVerificationPreviewModal(true);
      }
    };

    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [shopName]);

  // Fixed: Move element selection inside useEffect to avoid SSR issues
  useEffect(() => {
    const handler = () => setShowVerificationPreviewModal(true);

    // Use a small delay to ensure the DOM is fully rendered
    const setupListener = () => {
      const el = document.getElementById('trigger-verification-preview');
      if (el) {
        el.addEventListener('click', handler);
        return el;
      }
      return null;
    };

    // Try immediately first
    let element = setupListener();

    // If element not found, try again after a short delay
    let timeoutId;
    if (!element) {
      timeoutId = setTimeout(() => {
        element = setupListener();
      }, 100);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (element) {
        element.removeEventListener('click', handler);
      }
    };
  }, [shop]); // Depend on shop since the HTML content depends on it


  const htmlContent = `
  <div class="container">
    <div class="header">
      <h1>Quick Verification Needed</h1>
    </div>

    <div class="content">

      <h2 style="text-align: center; font-size: 22px; margin-top: 0; font-weight: 600; color: #333;">
        Thank you for shopping with ${shopName}
      </h2>

      <p style="margin-top: 24px;">Hi [customer name],</p>

      <p style="margin-top: 12px;">
        Thanks for placing your order with <span style="font-weight: 600;">${shopName}</span>!
        Before we can process your order <span style="font-weight: 500;">#[order number]</span>, we need to confirm a few details.
      </p>

      <div class="card">
        <h3>Order Summary</h3>
        <div class="summary-grid">
          <div>Order Number:</div><div>[order number]</div>
          <div>Date:</div><div>[order date]</div>
          <div>Product:</div><div>[product name or image]</div>
        </div>
        <div class="total">
          <span>Total Amount:</span>
          <strong>[order total]</strong>
        </div>
      </div>

      <p style="margin-top: 24px;">
        Our system detected some unusual activity with this order.
        This extra step helps protect you and our store from fraudulent transactions.
        It's quick and secure — and once completed, your order will be automatically approved.
      </p>

      <p style="margin-top: 24px;">Please click the secure link below to verify your information:</p>

      <div style="text-align: center; margin: 30px 0;">
        <div id="trigger-verification-preview" class="button" style="cursor:pointer;">Verify My Order</div>
      </div>

      <p style="margin-top: 16px;">
        <span style="font-weight: 500;">Note:</span> Please complete verification within 24 hours.
        If not verified, your order may be canceled.
      </p>

      <p style="margin-top: 16px;">
        If you have any questions,
        <br />
        visit our website: <a style="color: #4a90e2;" href="https://${shop}" target="_blank">${shopName}</a>
      </p>

      <p style="margin-top: 24px;">Thank you,</p>
      <p style="margin-top: 4px;">The ${shopName} Team</p>

      <div class="fraudguard-tag">
        <img src="https://fraudgard-shopify-app.vercel.app/logo.png" alt="FraudGuard" />
        <span>This message was sent via FraudGuard on behalf of ${shopName}</span>
      </div>
    </div>

    <div class="footer">
      <p>This is an automated message. Please do not reply.</p>
      <p>Need help? Contact our support team anytime.</p>
    </div>
  </div>

  <style>
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #333;
      line-height: 1.6;
    }
    .header {
      background-color: #4a90e2;
      padding: 20px;
      text-align: center;
    }
    .header h1 {
      color: #fff;
      margin: 0;
      font-size: 22px;
      font-weight: 600;
    }
    .content {
      background-color: #fff;
      padding: 30px 20px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }
    .card {
      background-color: #f9f9f9;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      margin: 24px 0;
    }
    .card h3 {
      margin-top: 0;
      margin-bottom: 15px;
      font-size: 18px;
      font-weight: 600;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 20px;
      font-size: 14px;
      font-weight: 500;
    }
    .total {
      display: flex;
      justify-content: space-between;
      background-color: #eaf1fb;
      padding: 12px;
      border-radius: 6px;
      margin-top: 15px;
      font-size: 16px;
      font-weight: 600;
    }
    .button {
      background-color: #4a90e2;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 5px;
      font-weight: 600;
      font-size: 16px;
    }
    .button:hover {
      background-color: #357ABD;
    }
    .fraudguard-tag {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #777;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .fraudguard-tag img {
      height: 20px;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      font-size: 12px;
      color: #999;
    }
  </style>
`;

  useEffect(() => {
    if (shop) {
      getActualShopName(shop as string).then((name) => {
        setShopName(name);
      });
    }
  }, [shop]);

  useEffect(() => {
    if (shopName) {
      setEmailContent({
        from: `Order Verification - ${shopName}`,
        subject: `Quick verification needed for your order #{order_number}`,
        body: `Thank you for shopping with ${shopName}`
      });
    }
  }, [shopName]);


  return (
    <>
      {
        showVerificationPreviewModal && (
          <div
            onClick={() => setShowVerificationPreviewModal(false)}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-10 p-4 sm:p-6"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative"
            >
              <img
                src="/verification-preview.png"
                alt="verification preview card"
                className="max-w-full max-h-screen rounded shadow-lg"
              />
              <button
                onClick={() => setShowVerificationPreviewModal(false)}
                className="absolute px-4 py-1 top-4 right-4 text-white bg-[#0F2237] hover:bg-[#0F2237]/80 rounded-full p-2"
              >
                Close
              </button>
            </div>
          </div>
        )
      }
      {
        onboarding && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-10 p-4 sm:p-6">
            <div className="bg-white rounded-lg shadow-md w-full max-w-2xl overflow-auto max-h-[90vh] sm:max-h-[90vh] relative">
              {/* Close button */}
              <button
                onClick={() => {
                  const { onboarding, ...query } = router.query;
                  router.push({
                    pathname: router.pathname,
                    query
                  });
                }}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors duration-200 z-20"
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Welcome Section */}
              <div className="p-4 sm:p-6 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center mb-4">
                  <img src="/logo.png" alt="FraudGuard Logo" className="w-10 h-10 sm:w-12 sm:h-12 mr-0 sm:mr-4 mb-2 sm:mb-0" />
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Welcome to FraudGuard!</h1>
                </div>

                <p className="text-base sm:text-lg mb-3">Hi there 👋</p>
                <p className="text-gray-800 text-sm sm:text-base">
                  Thanks for installing FraudGuard. To make sure your store is fully
                  protected from fraud, please follow these two quick setup steps.
                </p>
              </div>

              {/* Step 1 Section */}
              <div className="p-4 sm:p-6 border-b border-gray-200">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
                  Step 1: Enable Manual Payment Capture
                </h2>

                <p className="mb-4 text-gray-800 text-sm sm:text-base">
                  FraudGuard needs this enabled to place suspicious orders on hold before your customers
                </p>

                <ol className="list-decimal pl-5 sm:pl-6 mb-4 space-y-2 text-gray-800 text-sm sm:text-base">
                  <li>Go to your Shopify Admin</li>
                  <li>
                    Navigate to:
                    <div className="flex flex-wrap items-center my-1 text-sm text-gray-600">
                      <span className="mr-1">&#62;</span>
                      <span className="mx-1">Settings</span>
                      <span className="mr-1">&#62;</span>
                      <span className="mx-1">Checkout</span>
                    </div>
                  </li>
                  <li>
                    Under Payment capture, choose:
                    <div className="font-semibold mt-1">Manually capture payment for orders</div>
                  </li>
                </ol>

                {/* Settings visualization */}
                <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden w-full text-sm">
                  <div className="text-center font-medium py-2 border-b border-gray-200">Settings</div>
                  <div className="flex flex-col sm:flex-row">
                    <div className="w-full sm:w-1/2 py-2 px-4">
                      <div className="py-1">...Settings</div>
                      <div className="py-1 bg-blue-50">Payments</div>
                    </div>
                    <div className="w-full sm:w-1/2 border-t sm:border-t-0 sm:border-l border-gray-200 py-2 px-4">
                      <div className="py-1">Checkout</div>
                      <div className="py-1">Payment capture</div>

                      {/* Options */}
                      {[
                        "Automatically at checkout",
                        "Automatically when the entire order is fulfilled",
                        "Manually"
                      ].map((label, idx) => (
                        <div className="flex items-center py-1" key={label}>
                          <div className={`w-4 h-4 mr-2 border border-gray-300 rounded-full flex items-center justify-center ${label === "Manually" ? "bg-blue-600" : ""}`}>
                            <div className={`rounded-full ${label === "Manually" ? "w-1.5 h-1.5 bg-white" : "w-2 h-2 bg-white"}`}></div>
                          </div>
                          <span className="text-sm">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex mt-6 mb-2 text-sm">
                  <div className="mr-3 text-amber-500 text-xl sm:text-2xl">⚠️</div>
                  <div>
                    <span className="font-semibold">Until this is enabled, FraudGuard cannot</span> protect your store.
                  </div>
                </div>

                <div className="ml-8 mt-3">
                  <a
                    href={`https://admin.shopify.com/store/${shop.toString().split('.')[0]}/settings/payments`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-medium hover:underline text-sm sm:text-base"
                  >
                    Click here to go directly to your Checkout Settings
                  </a>
                </div>
              </div>

              {/* Step 2 Section */}
              <div className="p-4 sm:p-6 border-b border-gray-200">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
                  Step 2: Configure Your App Settings
                </h2>

                <p className="mb-4 text-gray-800 text-sm sm:text-base">
                  After enabling manual capture, you'll configure how app functions.
                </p>

                <p className="font-medium mb-3">Recommended Default Settings:</p>

                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-yellow-300 mr-3"></div>
                    <span className="font-medium text-sm sm:text-base">Medium Risk</span>
                    <span className="mx-2">→</span>
                    <span className="text-sm sm:text-base">Hold + Send verification email</span>
                  </div>

                  <div className="flex items-center">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-red-500 mr-3"></div>
                    <span className="font-medium text-sm sm:text-base">High Risk</span>
                    <span className="mx-2">→</span>
                    <span className="text-sm sm:text-base">Hold + Send verification email</span>
                  </div>
                </div>
              </div>

              {/* Footer Button Section */}
              <div className="p-4 sm:p-6">
                {error && (
                  <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm sm:text-base">
                    {error}
                  </div>
                )}

                <button
                  disabled={loading || !shop}
                  onClick={completeOnboarding}
                  className={`w-full ${loading || !shop ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-700'
                    } bg-blue-600 text-white font-medium text-base sm:text-lg py-3 sm:py-4 px-6 rounded-md transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                >
                  {!shop ? 'Loading...' : 'Go to Settings and Finish Setup'}
                </button>
              </div>
            </div>
          </div>

        )
      }
      <div className="min-h-screen bg-slate-50 flex">
        <Sidebar host={String(host)} shop={String(shop)} />
        <main className="flex flex-col w-full items-center py-8 px-20 space-y-8">

          {/* Title */}
          <div className="flex flex-col justify-center w-full max-w-6xl mx-auto mb-4">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <LucideSettings className="text-white" size={20} />
              </div>
              <h1 className="ml-4 text-3xl font-bold text-slate-900">
                Settings
              </h1>
            </div>
            <span className="text-slate-600 mt-2">Configure fraud detection and automated actions</span>
          </div>

          {/* Manual Capture Section */}
          <div className="flex flex-col w-full max-w-6xl mx-auto mb-4 bg-white rounded-lg p-6 shadow-lg">
            <div className='flex items-center'>
              <LucideShield className='text-blue-600 w-5 h-5' />
              <span className='ml-3 text-lg font-semibold'>Manual Capture Mode</span>
            </div>
            <div className='flex flex-col'>
              <div className='flex items-center justify-between mt-4'>
                <div className='flex flex-col'>
                  <span className='text-md text-slate-800 font-semibold'>
                    Confirm manual capture mode
                  </span>
                  <span className='text-sm text-slate-600'>
                    Please enable manual payment capture in your Shopify settings-FraudGuard requires it to operate correctly.
                  </span>
                </div>
                <div className="flex items-center">
                  <button
                    type="button"
                    className={`relative inline-flex px-[2px] h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${manualCaptureStatus ? 'bg-black' : 'bg-gray-200'} ${manualCaptureLoading ? 'opacity-60 pointer-events-none grayscale' : ''}`}
                    onClick={() => updateManualCaptureStatus(!manualCaptureStatus)}
                    disabled={manualCaptureLoading}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full shadow-md bg-white transition-transform ${manualCaptureStatus ? 'translate-x-5' : ''}`}
                    />
                  </button>
                </div>
              </div>

              <div
                className={`transition-all duration-300 ease-in-out ${manualCaptureStatus
                  ? 'opacity-100 max-h-20 translate-y-0'
                  : 'opacity-0 max-h-0 translate-y-2 overflow-hidden'
                  }`}
              >
                <div className='flex bg-green-50 border border-green-200 p-4 rounded-md shadow-sm mt-4'>
                  <div className='flex items-center'>
                    <LucideCircleCheckBig className='text-black w-4 h-4' />
                    <span className='ml-3 text-sm text-green-600'>
                      I've enabled manual payment capture in the Shopify settings.
                    </span>
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* Storefront Integration */}
          <div className="flex flex-col w-full max-w-6xl mx-auto mb-4 bg-white rounded-lg p-6 shadow-lg">
            <div className="flex items-center">
              <LucideShield className="text-purple-600 w-5 h-5" />
              <span className="ml-3 text-lg font-semibold">
                Storefront Integration
              </span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-between mt-4">
                <div className="flex flex-col">
                  <span className="text-md text-slate-800 font-semibold">
                    Enable FraudGuard in your App Embeds.
                  </span>
                  <span className="text-sm text-slate-600">
                    To fully utilize your blocklist and allowlist rules, enable
                    the FraudGuard app embed in your Shopify theme.
                  </span>
                </div>
                <div className="flex items-center">
                  <button
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-xs"
                    onClick={() => {
                      if (!shop) return;
                      // Open the Theme Editor for the merchant's current theme
                      const themeEditorUrl = `https://${shop}/admin/themes/current/editor`;
                      window.open(themeEditorUrl, "_blank");
                    }}
                  >
                    Open Theme Editor
                  </button>
                </div>
              </div>

              <div
                className={`transition-all duration-300 ease-in-out`}
              >
                <div className="flex bg-blue-50 border border-blue-200 p-4 rounded-md shadow-sm mt-4">
                  <div className="flex items-center">
                    <span className="ml-3 text-sm text-blue-600">
                      <b>Instructions: </b> In the Theme Editor, look for the "App embeds" section and enable "FraudGuard Protection".
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Order flagging section */}

          <div className="relative flex flex-col w-full max-w-6xl mx-auto mb-4 bg-white rounded-lg p-6 shadow-lg">
            <div className='flex items-center'>
              <LucideTriangleAlert className='text-yellow-600 w-5 h-5' />
              <span className='ml-3 text-lg font-semibold'>Order Flagging</span>
            </div>

            <span className='font-medium mt-6'>Which orders to flag</span>

            {/* Order flagging settings selector */}
            <div className="relative w-full mb-2">
              <button
                onClick={() => setIsFlagOptionsOpen(!isFlagOptionsOpen)}
                className={`flex px-4 items-center justify-between mt-4 border border-gray-200 rounded-md p-2 w-full ${flagRiskLoading ? 'opacity-60 pointer-events-none grayscale' : ''}`}
                disabled={flagRiskLoading}
              >
                <span className='text-sm text-slate-900'>{flagOptions.find(opt => opt.value === flagRiskLevel)?.label || ''}</span>
                <LucideChevronDown className='w-4 h-4 text-slate-500' />
              </button>

              {
                isFlagOptionsOpen && (
                  <div className='absolute left-0 right-0 mt-2 flex flex-col w-full z-10'>
                    <div className='flex flex-col bg-white shadow-sm border border-gray-200 rounded-md px-2 py-1'>
                      {flagOptions.map(option => (
                        <button
                          key={option.value}
                          className={`flex items-center px-2 py-2 text-left rounded transition-colors text-sm ${flagRiskLevel === option.value ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'} ${flagRiskLoading ? 'opacity-60 pointer-events-none grayscale' : ''}`}
                          onClick={() => {
                            updateFlagRiskLevel(option.value);
                            setIsFlagOptionsOpen(false);
                          }}
                          disabled={flagRiskLoading}
                        >
                          {flagRiskLevel === option.value && (
                            <svg className="w-4 h-4 mr-2 text-slate-900" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              }

              <div className='flex flex-col bg-blue-50 border border-blue-200 p-4 rounded-md shadow-sm mt-5'>
                <div className='flex'>
                  <LucideInfo className='text-black w-4 h-4 flex-shrink-0 mt-[2px]' />
                  <span className='ml-2 text-sm text-blue-700 font-bold'>Verification Emails: <span className='text-sm font-normal'>
                    Verification emails are automatically sent to High and Medium Risk orders unless they are auto-cancelled.
                  </span></span>
                </div>
              </div>
            </div>

          </div>

          {/* Email Verification Template */}
          <div className="relative flex flex-col w-full max-w-6xl mx-auto mb-4 bg-white rounded-lg p-6 shadow-lg">
            <div className='flex items-center'>
              <LucideMail className='text-blue-600 w-5 h-5' />
              <span className='ml-3 text-lg font-semibold'>Email Verification Template</span>
            </div>

            {/* <div className='flex flex-col mt-3'>
              <span className='text-md text-slate-800 font-semibold mt-4'>From</span>
              <input type="text" value={emailContent.from} onChange={(e) => setEmailContent({ ...emailContent, from: e.target.value })} className='border border-gray-200 rounded-md px-2 py-2 mt-2 text-sm' />
              <span className='text-md text-slate-800 font-semibold mt-4'>Subject</span>
              <input value={emailContent.subject} onChange={(e) => setEmailContent({ ...emailContent, subject: e.target.value })} type="text" className='border border-gray-200 rounded-md px-2 py-2 mt-2 text-sm' />
              <span className='text-md text-slate-800 font-semibold mt-4'>Body</span>
              <textarea value={emailContent.body} onChange={(e) => setEmailContent({ ...emailContent, body: e.target.value })} className='border border-gray-200 min-h-28 rounded-md px-2 py-2 mt-2 text-sm' />
            </div> */}

            <div className="max-w-2xl ml-4 my-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="mb-2">
                  <span className="font-semibold">From:</span>
                  <span className="ml-1">{`Order Verification - ${shopName}`}</span>
                </div>
                <div className="mb-2">
                  <span className="font-semibold">Subject:</span>
                  <span className="ml-1">{`Quick verification needed for your order #[order number]`}</span>
                </div>
                <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}

export default Settings