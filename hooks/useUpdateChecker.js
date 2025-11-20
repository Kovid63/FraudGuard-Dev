// hooks/useUpdateChecker.js
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

export const useUpdateChecker = (options = {}) => {
  const {
    checkInterval = 5 * 60 * 1000, // 5 minutes default
    checkOnFocus = true,
    checkOnVisibilityChange = true,
    enabled = true
  } = options;

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState(null);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [latestVersion, setLatestVersion] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [mounted, setMounted] = useState(false);

  const intervalRef = useRef(null);

  // Initialize current version from API on first load
  useEffect(() => {
    setMounted(true);
    
    const initializeVersion = async () => {
      if (typeof window === 'undefined') return;
      
      // Clean up any malformed stored versions
      const savedVersion = localStorage.getItem('app-version');
      if (savedVersion && (savedVersion.includes('$VERCEL') || savedVersion === 'unknown')) {
        localStorage.removeItem('app-version');
      }

      // Try to get stored version first
      const cleanSavedVersion = localStorage.getItem('app-version');
      if (cleanSavedVersion) {
        setCurrentVersion(cleanSavedVersion);
        return;
      }

      // If no valid stored version, don't fetch immediately, just set to 'abc1234' in localStorage for now
      setCurrentVersion('abc1234');
      localStorage.setItem('app-version', 'abc1234');

      // // Fetch version from API
      // try {
      //   const response = await fetch('/api/version');
      //   if (response.ok) {
      //     const data = await response.json();
      //     const version = data.shortVersion;
      //     setCurrentVersion(version);
      //     localStorage.setItem('app-version', version);
      //   }
      // } catch (error) {
      //   console.error('Failed to initialize version:', error);
      //   // Fallback to timestamp-based version
      //   const fallbackVersion = `init-${Date.now().toString().slice(-8)}`;
      //   setCurrentVersion(fallbackVersion);
      //   localStorage.setItem('app-version', fallbackVersion);
      // }
    };

    initializeVersion();
  }, []);

  const checkForUpdates = useCallback(async (force = false) => {
    if (!mounted || !enabled || (!force && isChecking)) {
      return { updateAvailable: false, error: null };
    }

    setIsChecking(true);
    setError(null);

    try {
      const response = await fetch('/api/version', {
        method: 'GET',
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const versionData = await response.json();
      const newVersion = versionData.shortVersion;

      setLatestVersion(versionData);
      setLastChecked(Date.now());

      // Compare versions
      const hasUpdate = currentVersion && 
                       currentVersion !== 'unknown' && 
                       newVersion !== 'unknown' && 
                       newVersion !== currentVersion;

      if (hasUpdate) {
        console.log(`Update detected: ${currentVersion} → ${newVersion}`);
        setUpdateAvailable(true);
      }

      return { 
        updateAvailable: hasUpdate, 
        error: null, 
        oldVersion: currentVersion,
        newVersion: newVersion
      };

    } catch (error) {
      console.error('Update check failed:', error);
      setError(error.message);
      return { updateAvailable: false, error: error.message };
    } finally {
      setIsChecking(false);
    }
  }, [mounted, enabled, isChecking, currentVersion]);

  // Apply update function
  const applyUpdate = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    if (latestVersion && typeof localStorage !== 'undefined') {
      localStorage.setItem('app-version', latestVersion.shortVersion);
    }
    window.location.reload();
  }, [latestVersion]);

  // Dismiss update function
  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  // Set up polling interval
  useEffect(() => {
    if (!mounted || !enabled || checkInterval <= 0 || !currentVersion) {
      return;
    }

    intervalRef.current = setInterval(() => {
      checkForUpdates();
    }, checkInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkForUpdates, checkInterval, enabled, mounted, currentVersion]);

  // Check on window focus
  useEffect(() => {
    if (!mounted || !checkOnFocus || !enabled || !currentVersion) return;

    const handleFocus = () => {
      const timeSinceLastCheck = lastChecked ? Date.now() - lastChecked : Infinity;
      if (timeSinceLastCheck > 30000) {
        checkForUpdates();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [mounted, checkOnFocus, enabled, checkForUpdates, lastChecked, currentVersion]);

  // Check on visibility change
  useEffect(() => {
    if (!mounted || !checkOnVisibilityChange || !enabled || !currentVersion) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const timeSinceLastCheck = lastChecked ? Date.now() - lastChecked : Infinity;
        if (timeSinceLastCheck > 30000) {
          checkForUpdates();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [mounted, checkOnVisibilityChange, enabled, checkForUpdates, lastChecked, currentVersion]);

  // Initial check on mount (after version is initialized)
  useEffect(() => {
    if (mounted && enabled && currentVersion) {
      // Small delay to ensure everything is initialized
      setTimeout(() => checkForUpdates(), 2000);
    }
  }, [mounted, enabled, currentVersion]);

  // Don't return anything until mounted and version is initialized
  if (!mounted || !currentVersion) {
    return {
      updateAvailable: false,
      isChecking: false,
      error: null,
      currentVersion: null,
      latestVersion: null,
      lastChecked: null,
      checkForUpdates: () => Promise.resolve({ updateAvailable: false, error: null }),
      applyUpdate: () => {},
      dismissUpdate: () => {}
    };
  }

  return {
    updateAvailable,
    isChecking,
    error,
    currentVersion,
    latestVersion,
    lastChecked,
    checkForUpdates: () => checkForUpdates(true),
    applyUpdate,
    dismissUpdate
  };
};