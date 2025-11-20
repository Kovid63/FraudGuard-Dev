import React from 'react'

const SkeletonLoader = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center bg-white p-4 border-b shadow-sm">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-blue-600 rounded animate-pulse"></div>
          <div className="ml-3 h-5 w-28 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="ml-8 flex items-center">
          <div className="w-6 h-6 bg-blue-600 rounded animate-pulse"></div>
          <div className="ml-2 h-5 w-20 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-48 bg-white border-r min-h-screen">
          <div className="p-4 space-y-2">
            <div className="flex items-center p-2 bg-blue-50 rounded">
              <div className="w-4 h-4 bg-blue-200 rounded animate-pulse"></div>
              <div className="ml-3 h-4 w-20 bg-blue-200 rounded animate-pulse"></div>
            </div>
            <div className="flex items-center p-2">
              <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="ml-3 h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {/* Risk Prevented */}
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                <div className="w-8 h-8 bg-green-100 rounded-full animate-pulse"></div>
              </div>
              <div className="h-8 w-16 bg-gray-300 rounded animate-pulse mb-2"></div>
              <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>

            {/* Orders On Hold */}
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 w-28 bg-gray-200 rounded animate-pulse"></div>
                <div className="w-8 h-8 bg-yellow-100 rounded-full animate-pulse"></div>
              </div>
              <div className="h-8 w-8 bg-gray-300 rounded animate-pulse mb-2"></div>
              <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>

            {/* Orders Cancelled */}
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                <div className="w-8 h-8 bg-red-100 rounded-full animate-pulse"></div>
              </div>
              <div className="h-8 w-4 bg-gray-300 rounded animate-pulse mb-2"></div>
              <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>

            {/* Orders Approved */}
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                <div className="w-8 h-8 bg-blue-100 rounded-full animate-pulse"></div>
              </div>
              <div className="h-8 w-4 bg-gray-300 rounded animate-pulse mb-2"></div>
              <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>

          {/* Order Management Section */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b">
              <div className="h-6 w-40 bg-gray-200 rounded animate-pulse"></div>
            </div>

            {/* Tabs */}
            <div className="px-6 py-4 border-b">
              <div className="flex space-x-6">
                <div className="h-4 w-16 bg-blue-200 rounded animate-pulse"></div>
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 w-18 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 py-4 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="flex space-x-2">
                  <div className="h-8 w-20 bg-gray-800 rounded animate-pulse"></div>
                  <div className="h-8 w-16 bg-red-500 rounded animate-pulse"></div>
                  <div className="h-8 w-32 bg-blue-500 rounded animate-pulse"></div>
                  <div className="h-8 w-18 bg-orange-500 rounded animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Order Rows */}
            <div className="divide-y">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-4 h-4 bg-gray-200 rounded animate-pulse mt-1"></div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-4">
                          <div className="h-5 w-20 bg-gray-300 rounded animate-pulse font-medium"></div>
                          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <div className="w-4 h-4 bg-gray-200 rounded animate-pulse mr-1"></div>
                            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                          </div>
                          <div className="flex items-center">
                            <div className="w-4 h-4 bg-gray-200 rounded animate-pulse mr-1"></div>
                            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
                          <div className="h-4 w-20 bg-gray-300 rounded animate-pulse"></div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
                          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center space-x-2">
                          <div className="h-4 w-20 bg-orange-200 rounded animate-pulse"></div>
                          <div className="h-4 w-32 bg-orange-200 rounded animate-pulse"></div>
                        </div>
                        <div className="h-4 w-28 bg-gray-200 rounded animate-pulse"></div>
                        <div className="flex items-center space-x-2">
                          <div className="h-4 w-24 bg-yellow-200 rounded animate-pulse"></div>
                          <div className="h-4 w-16 bg-blue-200 rounded animate-pulse"></div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="h-4 w-32 bg-blue-200 rounded animate-pulse"></div>
                        <div className="flex space-x-2">
                          <div className="h-8 w-28 bg-gray-900 rounded animate-pulse"></div>
                          <div className="h-8 w-16 bg-red-100 rounded animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SkeletonLoader;