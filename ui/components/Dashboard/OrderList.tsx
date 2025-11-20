import React from 'react';
import OrderCard from './OrderCard';

export default function OrderList({ orders, visibleCards, isTabTransitioning, selectedOrderIds, onCheckboxChange, shop, onResendEmail, onCapturePayment, onCancelOrder, activeTab, showRemark }: {
  orders: any[],
  visibleCards: number[],
  isTabTransitioning: boolean,
  selectedOrderIds: any[],
  onCheckboxChange: (id: any, checked: boolean) => void,
  shop: string,
  onResendEmail: () => void,
  onCapturePayment: (orderId: string) => Promise<void>,
  onCancelOrder: (orderId: string) => Promise<void>,
  activeTab: string,
  showRemark: boolean
}) {
  return (
    <>
      {orders.map((order, idx) => (
        <OrderCard
          key={order.id || idx}
          order={order}
          idx={idx}
          visible={visibleCards.includes(idx)}
          isTabTransitioning={isTabTransitioning}
          selected={selectedOrderIds.includes(order.id)}
          onCheckboxChange={checked => onCheckboxChange(order.id, checked)}
          shop={shop}
          onResendEmail={onResendEmail}
          onCapturePayment={onCapturePayment}
          onCancelOrder={onCancelOrder}
          activeTab={activeTab}
          showRemark={showRemark}
        />
      ))}
    </>
  );
} 