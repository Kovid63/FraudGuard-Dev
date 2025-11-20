import { ReactNode, useState, useRef, useEffect } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  colorClass: string;
  filterLabel?: string;
  showFilter?: boolean;
  showDecimals?: boolean;
  isCurrency?: boolean;
  filterValue?: string;
  setFilterValue?: (value: string) => void;
}

const bgColorMap = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
};

export default function MetricCard({ label, value, icon, colorClass, filterLabel = 'This Month', showFilter = true, showDecimals = false, isCurrency = false, filterValue, setFilterValue }: MetricCardProps) {
  const iconBg = `bg-${colorClass}-500 bg-opacity-10`;
  const iconText = `text-${colorClass}-500`;
  const bgCircleClass = `${bgColorMap[colorClass]} opacity-10`;

  const [isOpen, setIsOpen] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownActive, setDropdownActive] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Animation logic for dropdown
  useEffect(() => {
    if (isOpen) {
      setDropdownVisible(true);
      // Next tick, activate animation
      setTimeout(() => setDropdownActive(true), 10);
    } else if (dropdownVisible) {
      setDropdownActive(false);
      // Wait for animation before unmount
      const timeout = setTimeout(() => setDropdownVisible(false), 150);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  const options = [
    { label: "This Month", value: "this_month" },
    { label: "Last 7 Days", value: "last_7_days" },
    { label: "All Time", value: "" }
  ];

  return (
    <div className="rounded-lg text-card-foreground relative overflow-visible bg-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col justify-between h-full">
      {/* Green circle wrapper for clipping */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
        <div className={`absolute top-0 right-0 w-24 h-24 rounded-full transform translate-x-8 -translate-y-8 ${bgCircleClass}`} />
      </div>
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-600 mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-900">{typeof value === 'number' ? `${isCurrency ? '$' : ''}${showDecimals ? value.toFixed(2) : value}` : value}</p>
          </div>
          <div className={`p-3 rounded-xl ${iconBg}`}>
            <span className={`text-${colorClass}-600`}>{icon}</span>
          </div>
        </div>
      </div>
      {showFilter && <div className="px-6 pb-4 mt-auto" ref={dropdownRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="flex items-center justify-between rounded-md border bg-background px-3 py-2 pr-8 ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full h-8 text-xs border-slate-200 appearance-none transition-colors"
          >
            <span className="text-slate-900">{options.find(option => option.value === filterValue)?.label}</span>
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down h-4 w-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
            </span>
          </button>
          {dropdownVisible && (
            <div
              className={`absolute left-0 z-20 mt-2 w-full rounded-md bg-white shadow-lg border border-slate-100 py-2 transition-all duration-150 ${dropdownActive ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
                }`}
              style={{ willChange: 'opacity, transform' }}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`flex items-center w-full px-4 py-2 text-sm text-slate-900 hover:bg-gray-100 transition-colors ${options.find(option => option.value === filterValue)?.label === option.label ? "font-semibold" : ""
                    }`}
                  onClick={() => {
                    setFilterValue(option.value);
                    setIsOpen(false);
                  }}
                >
                  {options.find(option => option.value === filterValue)?.label === option.label && (
                    <svg className="w-4 h-4 mr-2 text-slate-900" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>}
    </div>
  );
} 