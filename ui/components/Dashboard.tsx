"use client";

import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useState } from "react";
import { PiGearSixBold } from "react-icons/pi";
import { ToastContainer, toast } from "react-toastify";
import OrdersTable from "./OrdersTable";
import Sidebar from "./Sidebar";
import { sendVerificationEmail } from "../../utils/verification";
import Link from "next/link";
import RiskStats from "./RiskStats";
import { ManualCaptureWarningContext } from '../../context/manualCaptureWarning';
import { createApp } from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';
import { LucideShield, LucideAlertCircle, LucideClock, LucideCircleX, LucideCircleCheckBig, LucideUser, Check, X, Mail, Archive } from "lucide-react";
import MetricCard from "./MetricCard";
import React from "react";
import OrderCard from './Dashboard/OrderCard';
import OrderSkeleton from './Dashboard/OrderSkeleton';
import SelectAllCheckbox from './Dashboard/SelectAllCheckbox';
import TabButtons from './Dashboard/TabButtons';
import OrderList from './Dashboard/OrderList';
import { useOrderCardAnimation } from './Dashboard/useOrderCardAnimation';
import { useTabTransition } from './Dashboard/useTabTransition';
import { useUpdateChecker } from '../../hooks/useUpdateChecker';
import UpdateNotification from '../components/UpdateNotification';

export interface Pagination {
  page: number;
  limit: number;
  pages: number;
}

export default function Dashboard({ onboardingRequired }: { onboardingRequired: boolean }) {
  const router = useRouter();
  const { shop, host } = router.query;

  // Create App Bridge app instance
  const app = createApp({
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!,
    host: host as string || 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvdXZzemgxLW01',
    forceRedirect: true,
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [isDashboardReady, setIsDashboardReady] = useState(false);
  const [activeTab, setActiveTab] = useState("On Hold");
  const { isTabTransitioning, handleTabSwitch } = useTabTransition(activeTab, setActiveTab);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('ready'); // 'ready', 'processing', 'redirecting'
  const {
    updateAvailable,
    currentVersion,
    latestVersion,
    checkForUpdates,
    applyUpdate,
    dismissUpdate,
    isChecking,
    error
  } = useUpdateChecker({
    checkInterval: 5 * 60 * 1000, // Check every 5 minutes
    checkOnFocus: true,
    checkOnVisibilityChange: true,
    enabled: true
  });

  // check if update is needed


  // ADD THIS WRAPPER FUNCTION RIGHT AFTER:
  const handleTabSwitchWithClearSelection = (newTab: string) => {
    setSelectedOrderIds([]); // Clear selections immediately
    handleTabSwitch(newTab);
  };

  const [riskStats, setRiskStats] = useState({
    riskPrevented: 0,
    ordersOnHold: 0,
  });
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState({
    email: false,
    approve: false,
    cancel: false,
    archive: false,
    initialData: true, // New loading state for initial data fetch
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    pages: 1,
  });

  const { manualCaptureWarning, setManualCaptureWarning } = useContext(ManualCaptureWarningContext);
  const [justProcessedUpdate, setJustProcessedUpdate] = useState(false);
  const [riskPreventedFilterValue, setRiskPreventedFilterValue] = useState("this_month");
  const [riskPreventedStats, setRiskPreventedStats] = useState(0);
  const [riskPreventedLoading, setRiskPreventedLoading] = useState(false);

  const [ordersApproved, setOrdersApproved] = useState<any[]>([]);
  const [ordersApprovedFilterValue, setOrdersApprovedFilterValue] = useState("this_month");
  const [ordersApprovedStats, setOrdersApprovedStats] = useState(0);
  const [ordersApprovedLoading, setOrdersApprovedLoading] = useState(false);

  const [ordersCancelled, setOrdersCancelled] = useState<any[]>([]);
  const [ordersCancelledFilterValue, setOrdersCancelledFilterValue] = useState("this_month");
  const [ordersCancelledStats, setOrdersCancelledStats] = useState(0);
  const [ordersCancelledLoading, setOrdersCancelledLoading] = useState(false);

  const [ordersAll, setOrdersAll] = useState<any[]>([]);
  const [ordersAllLoading, setOrdersAllLoading] = useState(false);

  const [ordersOnHoldLoading, setOrdersOnHoldLoading] = useState(false);

  // Add this hook at the top level
  const [selectedOrderIndices, setSelectedOrderIndices] = useState<number[]>([]);
  const allOrderIndices = [0, 1]; // For static cards
  const isAllSelected = allOrderIndices.every(idx => selectedOrderIndices.includes(idx));

  // Selection state for dynamic orders
  const [selectedOrderIds, setSelectedOrderIds] = useState<any[]>([]);
  const currentOrders = activeTab === "On Hold" ? orders : ordersAll;
  const allOrderIds = currentOrders.map(order => order.id);
  const isAllSelectedDynamic = allOrderIds.length > 0 && allOrderIds.every(id => selectedOrderIds.includes(id));

  // Loading state to track all necessary data loading processes
  const [loadingStates, setLoadingStates] = useState({
    onboardingChecked: false,
    manualCaptureChecked: false,
    ordersLoaded: false,
    riskStatsLoaded: false
  });

  const { visibleCards, setVisibleCards } = useOrderCardAnimation(
    activeTab,
    isDashboardReady,
    activeTab === "On Hold" ? orders.length : activeTab === "Approved" ? ordersApproved.length : activeTab === "Cancelled" ? ordersCancelled.length : ordersAll.length,
    isTabTransitioning
  );

  useEffect(() => {
    if (activeTab === "On Hold") {
      fetchOrders();
    } else if (activeTab === "Approved") {
      fetchOrdersApproved();
    } else if (activeTab === "Cancelled") {
      fetchOrdersCancelled();
    } else if (activeTab === "All Orders") {
      fetchOrdersAll();
    }
  }, [activeTab]);

  // Risk Prevented Filter - Update Stats
  useEffect(() => {
    fetchRiskPreventedStats();
  }, [riskPreventedFilterValue]);

  useEffect(() => {
    fetchOrdersCancelledStats();
  }, [ordersCancelledFilterValue]);

  useEffect(() => {
    fetchOrdersApprovedStats();
  }, [ordersApprovedFilterValue]);

  useEffect(() => {
    // Only run animation logic if dashboard is ready, not transitioning, and there are orders
    const currentOrdersLength = activeTab === "On Hold" ? orders.length : activeTab === "Approved" ? ordersApproved.length : activeTab === "Cancelled" ? ordersCancelled.length : ordersAll.length;
    if (!isDashboardReady || currentOrdersLength === 0 || isTabTransitioning) {
      setVisibleCards([]);
      return;
    }

    setVisibleCards([]); // Reset immediately
    const cardCount = activeTab === "On Hold" || activeTab === "All Orders" || activeTab === "Approved" || activeTab === "Cancelled" ? currentOrdersLength : 0;
    if (cardCount > 0) {
      setTimeout(() => {
        for (let i = 0; i < cardCount; i++) {
          setTimeout(() => {
            setVisibleCards((prev) => [...prev, i]);
          }, i * 150);
        }
      }, 10);
    }
  }, [activeTab, isDashboardReady, orders.length, ordersAll.length, ordersApproved.length, ordersCancelled.length, isTabTransitioning]);

  const getManualCaptureStatus = async () => {
    try {
      const response = await fetch(`/api/shop/onboarding?shop=${shop}`);
      const data = await response.json();
      if (!data.result?.manualCaptureEnabled) setManualCaptureWarning(false);
      setManualCaptureWarning(data.result?.manualCaptureEnabled);

      // Update loading state
      setLoadingStates(prev => ({ ...prev, manualCaptureChecked: true }));
    } catch (error) {
      console.error("Error checking manual capture status:", error);
      // Mark as checked even if there's an error to avoid blocking the UI
      setLoadingStates(prev => ({ ...prev, manualCaptureChecked: true }));
    }
  }

  useEffect(() => {
    if (onboardingRequired) {
      router.push(`/settings?shop=${shop}&host=${host}&onboarding=true`);
    } else {
      setLoadingStates(prev => ({ ...prev, onboardingChecked: true }));
    }
  }, [onboardingRequired, router, shop]);

  useEffect(() => {
    if (shop) {
      getManualCaptureStatus();
    }
  }, [shop]);

  // Effect to determine when dashboard is ready to display
  useEffect(() => {
    const { onboardingChecked, manualCaptureChecked, ordersLoaded, riskStatsLoaded } = loadingStates;
    console.log('Dashboard - Loading states:', { onboardingChecked, manualCaptureChecked, ordersLoaded, riskStatsLoaded });

    if (onboardingChecked && manualCaptureChecked && ordersLoaded && riskStatsLoaded) {
      setIsLoading(prev => ({ ...prev, initialData: false }));
      setIsDashboardReady(true);
      console.log('Dashboard - All loading states complete, dashboard ready');
    }
  }, [loadingStates]);

  // Add this useEffect after your existing useEffect hooks, around line 200-250
  useEffect(() => {
    // Clear selections when switching tabs
    setSelectedOrderIds([]);
  }, [activeTab]);

  const fetchRiskPreventedStats = async () => {
    setRiskPreventedLoading(true);
    const res = await fetch(`/api/dashboard/risk-prevented?shop=${shop}&filter=${riskPreventedFilterValue}`);
    const data = await res.json();
    setRiskPreventedStats(data.riskPrevented.value);
    setRiskPreventedLoading(false);
  }

  const fetchOrdersCancelledStats = async () => {
    setOrdersCancelledLoading(true);
    const res = await fetch(`/api/dashboard/orders-cancelled?shop=${shop}&filter=${ordersCancelledFilterValue}`);
    const data = await res.json();
    setOrdersCancelledStats(data.count);
    setOrdersCancelledLoading(false);
  }

  const fetchOrdersApprovedStats = async () => {
    setOrdersApprovedLoading(true);
    const res = await fetch(`/api/dashboard/orders-approved?shop=${shop}&filter=${ordersApprovedFilterValue}`);
    const data = await res.json();
    setOrdersApprovedStats(data.count);
    setOrdersApprovedLoading(false);
  }

  const fetchOrdersAll = async () => {
    setOrdersAllLoading(true);
    try {
      const res = await fetch(`/api/orders?shop=${shop}&page=1&limit=1000`);
      const data = await res.json();
      setOrdersAll(data?.orders || []);
    } catch (error) {
      console.error('Error fetching all orders:', error);
      setOrdersAll([]);
    } finally {
      setOrdersAllLoading(false);
    }
  }

  const fetchOrdersApproved = async () => {
    setOrdersApprovedLoading(true);
    try {
      const res = await fetch(`/api/orders?shop=${shop}&page=1&limit=1000&type=2`);
      const data = await res.json();
      setOrdersApproved(data?.orders || []);
    } catch (error) {
      console.error('Error fetching approved orders:', error);
      setOrdersApproved([]);
    } finally {
      setOrdersApprovedLoading(false);
    }
  }

  const fetchOrdersCancelled = async () => {
    setOrdersCancelledLoading(true);
    try {
      const res = await fetch(`/api/orders?shop=${shop}&page=1&limit=1000&type=3`);
      const data = await res.json();
      setOrdersCancelled(data?.orders || []);
    } catch (error) {
      console.error('Error fetching cancelled orders:', error);
      setOrdersCancelled([]);
    } finally {
      setOrdersCancelledLoading(false);
    }
  }

  const fetchOrders = async () => {
    console.log('Dashboard - Starting to fetch orders...');
    setOrdersOnHoldLoading(true);
    try {
      const res = await fetch(
        `/api/orders?shop=${shop}&page=1&limit=1000&type=1`
      );
      const data = await res.json();
      console.log('Dashboard - Orders fetched:', data?.orders?.length || 0, 'orders');
      setOrders(data?.orders || []);
      setPagination((prev) => ({ ...prev, pages: data?.pagination?.pages || 1 }));

      // Update loading state
      setLoadingStates(prev => ({ ...prev, ordersLoaded: true }));
      console.log('Dashboard - Orders loaded, setting ordersLoaded to true');
    } catch (error) {
      console.error("Error fetching orders:", error);
      // Mark as loaded even if there's an error to avoid blocking the UI
      setLoadingStates(prev => ({ ...prev, ordersLoaded: true }));
    } finally {
      setOrdersOnHoldLoading(false);
    }
  }



  const fetchRiskStats = async () => {
    try {
      const riskPreventedRes = await fetch(`/api/get-risk-stats?shop=${shop}&id=risk-prevented`);
      const riskPreventedData = await riskPreventedRes.json();

      const ordersOnHoldRes = await fetch(`/api/get-risk-stats?shop=${shop}&id=risk-orders`);
      const ordersOnHoldData = await ordersOnHoldRes.json();

      setRiskStats({
        riskPrevented: riskPreventedData?.result?.amount || 0,
        ordersOnHold: ordersOnHoldData?.result?.count || 0,
      });

      // Update loading state
      setLoadingStates(prev => ({ ...prev, riskStatsLoaded: true }));
    } catch (error) {
      console.error("Error fetching risk stats:", error);
      // Mark as loaded even if there's an error to avoid blocking the UI
      setLoadingStates(prev => ({ ...prev, riskStatsLoaded: true }));
    }
  }

  const refreshOrders = useCallback(async () => {
    if (!shop) return;
    try {
      await fetchOrders();
      await fetchRiskStats();

      // Check subscription status in order
      await checkSubscriptionStatus();
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  }, [shop, pagination.page, pagination.limit]);

  const checkSubscriptionStatus = async () => {
    try {
      // Step 1: Check if shop is lifetime free
      const lifetimeFreeRes = await fetch(`/api/shop/is-lifetime-free?shop=${shop}`);
      const lifetimeFreeData = await lifetimeFreeRes.json();
      const isLifetimeFreeShop = lifetimeFreeData.lifetimeFree;

      // If lifetime free, skip all other checks
      if (isLifetimeFreeShop) {
        console.log('Dashboard - Shop is lifetime free, skipping subscription checks');
        return;
      }

      // Step 2: Check for subscription updates
      const updateRes = await fetch(`/api/shop/subscription-update?shop=${shop}`);
      const updateData = await updateRes.json();
      console.log('Dashboard - Subscription update data:', updateData);

      if (updateData && updateData.length > 0 && updateData[0].applied === false) {
        console.log('Dashboard - Found pending subscription update:', updateData[0]);

        // Redirect first, then update
        if (updateData[0].redirectUrl) {
          // Use App Bridge redirect (preferred for embedded apps)
          try {
            const redirect = Redirect.create(app);
            redirect.dispatch(Redirect.Action.REMOTE, updateData[0].redirectUrl);
          } catch (redirectError) {
            console.error('App Bridge redirect failed, trying direct redirect:', redirectError);
            try {
              // Fallback: Direct window.location
              window.location.href = updateData[0].redirectUrl;
            } catch (directError) {
              console.error('Direct redirect also failed:', directError);
              // Final fallback: Create and click a link
              const link = document.createElement('a');
              link.href = updateData[0].redirectUrl;
              link.target = '_blank';
              link.click();
            }
          }
        } else {
          console.error('No redirect URL found in subscription update data');
        }

        // Update after redirect
        await fetch('/api/shop/subscription-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop, id: updateData[0].id }),
        });

        // Set flag to prevent immediate subscription check
        setJustProcessedUpdate(true);

        // Reset flag after 30 seconds to allow normal checks again
        setTimeout(() => setJustProcessedUpdate(false), 30000);
        return; // Skip other checks if there's a pending update
      }

      // Step 3: Check for active subscriptions
      const subscriptionRes = await fetch(`/api/shop/subscription-details?shop=${shop}`);
      const subscriptionData = await subscriptionRes.json();
      console.log('Dashboard - Subscription details:', subscriptionData);

      if (subscriptionData.subscriptions && subscriptionData.subscriptions.length === 0) {
        console.log('Dashboard - No active subscriptions found, redirecting to generic plan');
        // Create generic subscription plan
        const createRes = await fetch('/api/shop/subscription-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop,
            extendDays: 14, // Default trial period
            price: process.env.SHOPIFY_BILLING_AMOUNT || '19.99',
            interval: process.env.SHOPIFY_BILLING_INTERVAL || 'EVERY_30_DAYS'
          }),
        });

        const createData = await createRes.json();
        if (createData.confirmationUrl) {
          console.log('Dashboard - Redirecting to subscription confirmation:', createData.confirmationUrl);
          const redirect = Redirect.create(app);
          redirect.dispatch(Redirect.Action.REMOTE, createData.confirmationUrl);
        }
      } else {
        console.log('Dashboard - Active subscription found, proceeding normally');
      }
    } catch (error) {
      console.error('Dashboard - Error checking subscription status:', error);
    }
  };

  useEffect(() => {
    if (shop) {
      refreshOrders();
      const intervalId = setInterval(refreshOrders, 30000);
      return () => clearInterval(intervalId);
    }
  }, [shop, refreshOrders]);

  const handleOrdersSelected = (orders) => {
    setSelectedOrders(orders);
  };

  const validateOrderSelection = (selectedOrders) => {
    if (selectedOrders.length === 0) {
      toast.warn("No orders selected", { autoClose: 1000 });
      return false;
    }
    return true;
  };

  const updateLoadingState = (action, isLoading) => {
    setIsLoading((prev) => ({ ...prev, [action]: isLoading }));
  };

  const handleResendVerificationEmail = async () => {
    if (!validateOrderSelection(selectedOrderIds)) return;

    updateLoadingState("email", true);

    try {
      for (const orderId of selectedOrderIds) {
        const currentOrder = orders.find((o) => o.id === orderId);
        const res = await sendVerificationEmail(currentOrder, shop);

        if (res.success) {
          toast.success(
            `Verification email sent to ${currentOrder.email} for order ${currentOrder.name}`
          );
        } else {
          toast.error(`${res.message} for order ${currentOrder.name}`);
        }
      }
      await refreshOrders();
    } catch (error) {
      toast.error(`Error sending verification email: ${error}`);
    } finally {
      updateLoadingState("email", false);
    }
  };

  const handleApprove = async () => {
    if (!validateOrderSelection(selectedOrderIds)) return;

    updateLoadingState("approve", true);

    try {
      for (const orderId of selectedOrderIds) {
        const currentOrder = orders.find((o) => o.id === orderId);
        const res = await fetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, shop, orderAmount: currentOrder?.total_price, isManuallyApproved: true, admin_graphql_api_id: currentOrder?.admin_graphql_api_id }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Capture failed");
        }
        toast.success(`Payment captured for order ${orderId}`);
      }
      await refreshOrders();
    } catch (err) {
      toast.error(err.message);
    } finally {
      updateLoadingState("approve", false);
    }
  };

  const handleCancel = async () => {
    if (!validateOrderSelection(selectedOrderIds)) return;

    updateLoadingState("cancel", true);

    try {
      for (const orderId of selectedOrderIds) {
        const currentOrder = orders.find((o) => o.id === orderId);
        const res = await fetch("/api/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, shop, orderAmount: currentOrder?.total_price, isManuallyCancelled: true, admin_graphql_api_id: currentOrder?.admin_graphql_api_id }),
        });

        await res.json();

        if (!res.ok) {
          throw new Error("Cancellation failed");
        }
        toast.success(`Order cancelled for order ${orderId}`);
      }
      await refreshOrders();
    } catch (err) {
      toast.error(err.message);
    } finally {
      updateLoadingState("cancel", false);
    }
  };

  const handleArchive = async () => {
    if (!validateOrderSelection(selectedOrderIds)) return;

    updateLoadingState("archive", true);

    try {
      for (const orderId of selectedOrderIds) {
        const res = await fetch("/api/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, shop }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Archive failed");
        }
        toast.success(`Order archived for order ${orderId}`);
      }
      await refreshOrders();
    } catch (err) {
      toast.error(err.message);
    } finally {
      updateLoadingState("archive", false);
    }
  };

  // Loading content component (to be used within the layout)
  const LoadingContent = () => (
    <div className="flex-1 p-6 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700">Loading FraudGuard dashboard...</h2>
      </div>
    </div>
  );

  // We'll always show the sidebar, but conditionally show loading or dashboard content
  if (!isDashboardReady || isLoading.initialData) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar host={String(host)} shop={String(shop)} />
        <LoadingContent />
      </div>
    );
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(allOrderIds);
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleOrderCheckbox = (id: any, checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(prev => [...prev, id]);
    } else {
      setSelectedOrderIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleSingleOrderCapture = async (orderId: string): Promise<void> => {
    console.log('Dashboard: Starting single order capture for orderId:', orderId);
    updateLoadingState("approve", true);

    try {
      const currentOrder = orders.find((o) => o.id === orderId);
      console.log('Dashboard: Found order:', currentOrder);

      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          shop,
          orderAmount: currentOrder?.total_price,
          isManuallyApproved: true,
          admin_graphql_api_id: currentOrder?.admin_graphql_api_id
        }),
      });

      const data = await res.json();
      console.log('Dashboard: Capture API response:', data);

      if (!res.ok) {
        // Create a more meaningful error message from the API response
        let errorMessage = "Capture failed";
        if (data.error) {
          // Handle case where data.error is an object
          if (typeof data.error === 'string') {
            errorMessage = data.error;
          } else if (typeof data.error === 'object') {
            // Extract message from error object
            if (data.error.message) {
              errorMessage = data.error.message;
            } else if (data.error.error) {
              errorMessage = data.error.error;
            } else {
              errorMessage = JSON.stringify(data.error);
            }
          }
        } else if (data.errors && data.errors.transactions) {
          errorMessage = data.errors.transactions.join(', ');
        } else if (data.message) {
          errorMessage = data.message;
        }
        throw new Error(errorMessage);
      }
      await refreshOrders();
      console.log('Dashboard: Capture completed successfully');
    } catch (err) {
      console.error('Dashboard: Error in handleSingleOrderCapture:', err);
      throw err; // Re-throw to be caught by the OrderCard
    } finally {
      updateLoadingState("approve", false);
    }
  };

  const handleSingleOrderCancel = async (orderId: string): Promise<void> => {
    console.log('Dashboard: Starting single order cancel for orderId:', orderId);
    updateLoadingState("cancel", true);

    try {
      const currentOrder = orders.find((o) => o.id === orderId);
      console.log('Dashboard: Found order for cancel:', currentOrder);

      const res = await fetch("/api/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          shop,
          orderAmount: currentOrder?.total_price,
          isManuallyCancelled: true,
          admin_graphql_api_id: currentOrder?.admin_graphql_api_id
        }),
      });

      const data = await res.json();
      console.log('Dashboard: Cancel API response:', data);
      console.log('Dashboard: data.error type:', typeof data.error);
      console.log('Dashboard: data.error value:', data.error);
      if (data.error && typeof data.error === 'object') {
        console.log('Dashboard: data.error keys:', Object.keys(data.error));
      }

      if (!res.ok) {
        // Create a more meaningful error message from the API response
        let errorMessage = "Cancellation failed";
        if (data.error) {
          // Handle case where data.error is an object
          if (typeof data.error === 'string') {
            errorMessage = data.error;
          } else if (typeof data.error === 'object') {
            // Extract message from error object
            if (data.error.message) {
              errorMessage = data.error.message;
            } else if (data.error.error) {
              errorMessage = data.error.error;
            } else {
              errorMessage = JSON.stringify(data.error);
            }
          }
        } else if (data.errors && data.errors.transactions) {
          errorMessage = data.errors.transactions.join(', ');
        } else if (data.message) {
          errorMessage = data.message;
        }
        throw new Error(errorMessage);
      }
      await refreshOrders();
      console.log('Dashboard: Cancel completed successfully');
    } catch (err) {
      console.error('Dashboard: Error in handleSingleOrderCancel:', err);
      throw err; // Re-throw to be caught by the OrderCard
    } finally {
      updateLoadingState("cancel", false);
    }
  };

  if (updateAvailable) {

    const handleReAuth = async () => {
      setUpdateStatus('processing');

      try {
        // Show processing state briefly
        await new Promise(resolve => setTimeout(resolve, 500));

        // Update localStorage with new version BEFORE redirecting
        if (latestVersion?.shortVersion) {
          localStorage.setItem('app-version', latestVersion.shortVersion);
          console.log('Updated localStorage with new version:', latestVersion.shortVersion);
        }

        setUpdateStatus('redirecting');

        // Continue with your existing reauth logic
        const redirect = Redirect.create(app);
        redirect.dispatch(Redirect.Action.REMOTE, `${process.env.NEXT_PUBLIC_HOST}/api/auth/install?shop=${shop}&host=${host}&update=true`);

        // Fallback timeout
        setTimeout(() => {
          console.warn('Redirect timeout, trying fallback');
          if (window.top) {
            window.top.location.href = `${process.env.NEXT_PUBLIC_HOST}/api/auth/install?shop=${shop}&host=${host}&update=true`;
          }
        }, 3000);

      } catch (error) {
        console.error('Redirect failed:', error);
        setUpdateStatus('ready');

        // Try fallback immediately if redirect fails
        try {
          if (window.top) {
            window.top.location.href = `${process.env.NEXT_PUBLIC_HOST}/api/auth/install?shop=${shop}&host=${host}&update=true`;
          } else {
            window.location.href = `${process.env.NEXT_PUBLIC_HOST}/api/auth/install?shop=${shop}&host=${host}&update=true`;
          }
        } catch (fallbackError) {
          console.error('Fallback redirect also failed:', fallbackError);
          alert('Update failed. Please refresh the page and try again.');
        }
      }
    };

    const getButtonContent = () => {
      switch (updateStatus) {
        case 'processing':
          return {
            text: 'Preparing Update...',
            showSpinner: true
          };
        case 'redirecting':
          return {
            text: 'Redirecting...',
            showSpinner: true
          };
        default:
          return {
            text: 'Update Now',
            showSpinner: false
          };
      }
    };

    const buttonContent = getButtonContent();
    const isDisabled = updateStatus !== 'ready';

    return (
      <div className="min-h-screen bg-gray-50 flex">
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full animate-fadeInUp">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Update Available</h2>
            <p className="text-blue-600 text-center mb-6 text-sm font-semibold">
              Some permissions have changed. To continue using FraudGuard, please update the app by clicking the button below.
            </p>
            <div className="flex justify-center">
              <button
                className="bg-blue-600 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[140px] justify-center"
                onClick={handleReAuth}
                disabled={isDisabled}
              >
                {buttonContent.showSpinner && (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                )}
                {buttonContent.text}
              </button>
            </div>

            {updateStatus === 'redirecting' && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-500 mb-2">
                  Please wait while we redirect you to complete the update...
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '70%' }}></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <UpdateNotification
        updateAvailable={updateAvailable}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        onApplyUpdate={applyUpdate}
        onDismiss={dismissUpdate}
      />
      {
        !manualCaptureWarning && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 mt-5 min-h-10 w-[90vw] sm:w-[70vw] md:w-[60vw] lg:w-[40vw] rounded-lg bg-amber-200 flex items-center justify-center px-4 text-center">
            <span className="font-bold text-amber-600">
              ⚠️ Please enable Manual Payment Capture in your Shopify Settings for FraudGuard to work properly.
            </span>
          </div>
        )
      }
      {/* <div className="min-h-screen bg-gray-50 flex">
        <Sidebar host={String(host)} shop={String(shop)} />
        <ToastContainer />

        <main className="flex-1 p-6 space-y-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl">Dashboard</h1>
            <Link href={`/settings?shop=${shop}&host=${host}`}>
              <PiGearSixBold className="text-gray-500 cursor-pointer" size={20} />
            </Link>
          </div>

          <RiskStats riskStats={riskStats} />

          <div className="flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-900">
                Flagged Orders
              </h2>
            </div>

            <div className="space-x-2">
              <button
                disabled={isLoading.approve}
                onClick={handleApprove}
                className="btn btn-sm border px-3 py-1 rounded bg-white text-sm"
              >
                {isLoading.approve ? "Approving..." : "Approve"}
              </button>

              <button
                disabled={isLoading.cancel}
                onClick={handleCancel}
                className="btn btn-sm border px-3 py-1 rounded bg-white text-sm"
              >
                {isLoading.cancel ? "Cancelling..." : "Cancel"}
              </button>

              <button
                disabled={isLoading.email}
                onClick={handleResendVerificationEmail}
                className="btn btn-sm border px-3 py-1 rounded bg-white text-sm"
              >
                {isLoading.email ? "Sending..." : "Resend Verification"}
              </button>

              <select
                name="page-limit"
                id="page-limit"
                className="btn btn-sm border outline-none p-1 rounded bg-white text-sm"
                value={pagination.limit}
                onChange={(e) => setPagination({ ...pagination, limit: Number(e.target.value) })}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>

            <div className="mt-4">
              <OrdersTable
                onOrdersSelected={handleOrdersSelected}
                orders={orders}
                shop={String(shop)}
                pagination={pagination}
                refreshOrders={refreshOrders}
                setPagination={setPagination}
                actionButtons={true}
              />
            </div>
          </div>
        </main>
      </div> */}

      <div className="min-h-screen bg-slate-50 flex">
        <Sidebar host={String(host)} shop={String(shop)} />
        <ToastContainer />

        <main className="flex flex-col w-full items-center py-8 px-20 space-y-8">

          {/* Title */}
          <div className="flex items-center w-full max-w-6xl mx-auto mb-4">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <LucideShield className="text-white" size={20} />
            </div>
            <h1 className="ml-4 text-3xl font-bold text-slate-900">
              Dashboard
            </h1>
          </div>

          {/* Risk Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl mx-auto">
            <div className={`flex-1 min-w-[220px] max-w-xs ${riskPreventedLoading ? 'opacity-60 pointer-events-none' : ''}`}>
              <MetricCard
                label="Money Saved"
                value={Number(riskPreventedStats)}
                filterValue={riskPreventedFilterValue}
                setFilterValue={setRiskPreventedFilterValue}
                icon={<LucideShield className="w-5 h-5" />}
                colorClass="green"
                filterLabel="This Month"
                isCurrency={true}
                showDecimals={true}
              />
            </div>
            <div className="flex-1 min-w-[220px] max-w-xs">
              <MetricCard
                label="Orders On Hold"
                value={orders.length}
                icon={<LucideClock className="w-5 h-5" />}
                colorClass="amber"
                filterLabel="This Month"
                showFilter={false}
              />
            </div>
            <div className="flex-1 min-w-[220px] max-w-xs">
              <div className={`flex-1 min-w-[220px] max-w-xs ${ordersCancelledLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                <MetricCard
                  label="Orders Cancelled"
                  value={Number(ordersCancelledStats)}
                  filterValue={ordersCancelledFilterValue}
                  setFilterValue={setOrdersCancelledFilterValue}
                  icon={<LucideCircleX className="w-5 h-5" />}
                  colorClass="red"
                  filterLabel="This Month"
                />
              </div>
            </div>
            <div className="flex-1 min-w-[220px] max-w-xs">
              <div className={`flex-1 min-w-[220px] max-w-xs ${ordersApprovedLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                <MetricCard
                  label="Orders Approved"
                  value={Number(ordersApprovedStats)}
                  icon={<LucideCircleCheckBig className="w-5 h-5" />}
                  colorClass="blue"
                  filterLabel="This Month"
                  filterValue={ordersApprovedFilterValue}
                  setFilterValue={setOrdersApprovedFilterValue}
                />
              </div>
            </div>
          </div>

          {/* Order Management Section - pixel perfect, static data */}
          <div className="w-full max-w-6xl mx-auto mt-8 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Order Management</h2>
            {/* Tabs */}
            <TabButtons tabs={["On Hold", "Approved", "Cancelled", "All Orders"]} activeTab={activeTab} onTabSwitch={handleTabSwitchWithClearSelection} />
            {activeTab === "On Hold" && (
              <div className="flex flex-col" key={activeTab}>
                <>
                  <div className="flex items-center justify-between mb-2">
                    <SelectAllCheckbox checked={isAllSelectedDynamic} onChange={handleSelectAll} />
                    <div className="flex gap-2">
                      <button onClick={handleApprove} disabled={isLoading.approve} className="px-3 py-1.5 bg-gradient-to-r from-gray-800 to-black hover:from-gray-900 hover:to-gray-800 text-white text-sm font-medium rounded border-0 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-150 flex items-center gap-1.5">
                        <Check size={14} />
                        {isLoading.approve ? "Approving..." : "Approve"}
                      </button>
                      <button onClick={handleCancel} disabled={isLoading.cancel} className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm font-medium rounded border-0 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-150 flex items-center gap-1.5">
                        <X size={14} />
                        {isLoading.cancel ? "Cancelling..." : "Cancel"}
                      </button>
                      <button onClick={handleResendVerificationEmail} disabled={isLoading.email} className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-medium rounded border-0 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-150 flex items-center gap-1.5">
                        <Mail size={14} />
                        {isLoading.email ? "Sending..." : "Resend Verification"}
                      </button>
                      <button onClick={handleArchive} disabled={isLoading.archive} className="px-3 py-1.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white text-sm font-medium rounded border-0 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-150 flex items-center gap-1.5">
                        <Archive size={14} />
                        {isLoading.archive ? "Archiving..." : "Archive"}
                      </button>
                    </div>
                  </div>
                  <div className="h-px bg-gray-200 my-4 mb-6"></div>
                  {orders.length === 0 ? (
                    <div className="text-gray-700 text-center py-8 font-medium">
                      {ordersOnHoldLoading
                        ? 'Fetching the latest orders just for you...'
                        : (
                          <>
                            Oops! No orders are{' '}
                            <span className="font-bold text-blue-700">on hold</span>
                            {' '}right now.
                          </>
                        )
                      }
                    </div>
                  ) : (
                    <OrderList
                      orders={orders}
                      visibleCards={visibleCards}
                      isTabTransitioning={isTabTransitioning}
                      selectedOrderIds={selectedOrderIds}
                      onCheckboxChange={handleOrderCheckbox}
                      shop={String(shop)}
                      onResendEmail={refreshOrders}
                      onCapturePayment={handleSingleOrderCapture}
                      onCancelOrder={handleSingleOrderCancel}
                      activeTab={activeTab}
                      showRemark={false}
                    />
                  )}
                </>
              </div>
            )}
            {activeTab === "Approved" && (
              <div className="flex flex-col" key={activeTab}>

                <>
                  <div className="h-px bg-gray-200 my-4 mb-6"></div>
                  {ordersApproved.length === 0 ? (
                    <div className="text-gray-700 text-center py-8 font-medium">
                      {ordersApprovedLoading
                        ? 'Fetching the latest approved orders just for you...'
                        : (
                          <>
                            Oops! No orders are{' '}
                            <span className="font-bold text-blue-700">approved</span>
                            {' '}right now.
                          </>
                        )
                      }
                    </div>
                  ) : (
                    <OrderList
                      orders={ordersApproved}
                      visibleCards={visibleCards}
                      isTabTransitioning={isTabTransitioning}
                      selectedOrderIds={selectedOrderIds}
                      onCheckboxChange={handleOrderCheckbox}
                      shop={String(shop)}
                      onResendEmail={refreshOrders}
                      onCapturePayment={handleSingleOrderCapture}
                      onCancelOrder={handleSingleOrderCancel}
                      activeTab={activeTab}
                      showRemark={true}
                    />
                  )}
                </>

              </div>
            )}
            {activeTab === "Cancelled" && (
              <div className="flex flex-col" key={activeTab}>

                <>
                  <div className="h-px bg-gray-200 my-4 mb-6"></div>
                  {ordersCancelled.length === 0 ? (
                    <div className="text-gray-700 text-center py-8 font-medium">
                      {ordersCancelledLoading
                        ? 'Fetching the latest cancelled orders just for you...'
                        : (
                          <>
                            Oops! No orders are{' '}
                            <span className="font-bold text-blue-700">cancelled</span>
                            {' '}right now.
                          </>
                        )
                      }
                    </div>
                  ) : (
                    <OrderList
                      orders={ordersCancelled}
                      visibleCards={visibleCards}
                      isTabTransitioning={isTabTransitioning}
                      selectedOrderIds={selectedOrderIds}
                      onCheckboxChange={handleOrderCheckbox}
                      shop={String(shop)}
                      onResendEmail={refreshOrders}
                      onCapturePayment={handleSingleOrderCapture}
                      onCancelOrder={handleSingleOrderCancel}
                      activeTab={activeTab}
                      showRemark={true}
                    />
                  )}
                </>

              </div>
            )}
            {activeTab === "All Orders" && (
              <div className="flex flex-col" key={activeTab}>

                <>
                  <div className="h-px bg-gray-200 my-4 mb-6"></div>
                  {ordersAll.length === 0 ? (
                    <div className="text-gray-700 text-center py-8 font-medium">
                      {ordersAllLoading
                        ? 'Fetching all orders just for you...'
                        : (
                          <>
                            Oops! No orders found.
                            {' '}Please check back later.
                          </>
                        )
                      }
                    </div>
                  ) : (
                    <OrderList
                      orders={ordersAll}
                      visibleCards={visibleCards}
                      isTabTransitioning={isTabTransitioning}
                      selectedOrderIds={selectedOrderIds}
                      onCheckboxChange={handleOrderCheckbox}
                      shop={String(shop)}
                      onResendEmail={refreshOrders}
                      onCapturePayment={handleSingleOrderCapture}
                      onCancelOrder={handleSingleOrderCancel}
                      activeTab={activeTab}
                      showRemark={true}
                    />
                  )}
                </>

              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
};