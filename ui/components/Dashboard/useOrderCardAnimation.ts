"use client";

import { useEffect, useState } from 'react';

export function useOrderCardAnimation(activeTab: string, isDashboardReady: boolean, ordersLength: number, isTabTransitioning: boolean) {
  const [visibleCards, setVisibleCards] = useState<number[]>([]);

  useEffect(() => {
    if (!isDashboardReady || ordersLength === 0 || isTabTransitioning) {
      setVisibleCards([]);
      return;
    }
    setVisibleCards([]);
    const cardCount = activeTab === "On Hold" || activeTab === "All Orders" ? ordersLength : 0;
    if (cardCount > 0) {
      setTimeout(() => {
        for (let i = 0; i < cardCount; i++) {
          setTimeout(() => {
            setVisibleCards(prev => [...prev, i]);
          }, i * 150);
        }
      }, 10);
    }
  }, [activeTab, isDashboardReady, ordersLength, isTabTransitioning]);

  return { visibleCards, setVisibleCards };
} 