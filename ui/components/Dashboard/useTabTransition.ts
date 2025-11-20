import { useState } from 'react';

export function useTabTransition(activeTab: string, setActiveTab: (tab: string) => void) {
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);

  const handleTabSwitch = (tab: string) => {
    if (tab === activeTab) return;
    setIsTabTransitioning(true);
    setTimeout(() => {
      setActiveTab(tab);
      setIsTabTransitioning(false);
    }, 350);
  };

  return { isTabTransitioning, handleTabSwitch };
} 