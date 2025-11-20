import React from 'react';

interface UpdateNotificationProps {
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: any;
  onApplyUpdate: () => void;
  onDismiss: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  updateAvailable,
  currentVersion,
  latestVersion,
  onApplyUpdate,
  onDismiss
}) => {
  if (!updateAvailable) return null;

  return (
    <div className="fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm">
      <div className="flex items-center gap-3">
        <div className="text-2xl">🚀</div>
        <div className="flex-1">
          <h4 className="font-semibold mb-1">New Version Available!</h4>
          <p className="text-sm opacity-90">
            Version {latestVersion?.shortVersion} is ready
          </p>
          {currentVersion && (
            <p className="text-xs opacity-75 mt-1">
              Current: {currentVersion}
            </p>
          )}
        </div>
      </div>
      
      <div className="flex gap-2 mt-3">
        <button
          onClick={onDismiss}
          className="px-3 py-1 bg-blue-700 hover:bg-blue-800 rounded text-sm"
        >
          Later
        </button>
        <button
          onClick={onApplyUpdate}
          className="px-3 py-1 bg-white text-blue-600 hover:bg-gray-100 rounded text-sm font-semibold"
        >
          Refresh Now
        </button>
      </div>
    </div>
  );
};

export default UpdateNotification;