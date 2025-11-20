// pages/index.js

import React, { useState, useEffect, useRef } from "react";
import Head from "next/head";
import Sidebar from "../ui/components/Sidebar";
import { useRouter } from "next/router";
import {
  TriangleAlert,
  CircleCheck,
  Bot,
  Clock,
  Mail,
  Trash2,
} from "lucide-react";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/solid";

// --- Utility Components for Reusability ---

/**
 * Reusable component for a simple ON/OFF switch row.
 */
const ToggleSetting = ({ title, description, isEnabled, onToggle }) => (
  <div className="flex items-center justify-between py-3 last:border-b border-gray-100">
    <div className="pr-4">
      <h3 className="text-base font-medium text-gray-800">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </div>

    {/* Tailwind-styled Toggle Switch */}
    <button
      onClick={onToggle}
      className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-300 
        ${isEnabled ? "bg-black" : "bg-gray-200"}
      `}
      aria-checked={isEnabled}
      role="switch"
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transform 
          transition-transform ease-in-out duration-300
          ${isEnabled ? "translate-x-5" : "translate-x-0"}
        `}
      />
    </button>
  </div>
);

/**
 * ConfirmDeleteModal Component Definition
 */
const ConfirmDeleteModal = ({ rule, onConfirm, onCancel }) => {
  if (!rule) return null;

  return (
    // Modal Overlay (Fixed position, full screen, dark background)
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {/* Modal Content Box */}
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header (Confirm Deletion) */}
        <div className="flex justify-between items-start pb-3 mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Confirm Deletion
          </h2>
          <button
            onClick={onCancel}
            className="text-2xl text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        {/* Body Message */}
        <p className="text-gray-700 mb-6">
          Are you sure you want to delete the rule "
          <span className="font-bold">{rule.name}</span>"?
        </p>

        {/* Actions (Buttons) */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(rule.id)}
            className="px-4 py-2 text-white font-medium bg-red-500 rounded-md hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * CustomRule Component Definition
 */
const CustomRule = ({ rule, onToggle, onDelete, onEdit }) => {
  // Simple Toggle Switch implementation within the rule display
  const RuleToggle = () => (
    <button
      onClick={onToggle} // Correctly uses the onToggle prop
      className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer 
        transition-colors ease-in-out duration-300 
        ${rule.isEnabled ? "bg-black" : "bg-gray-200"}
      `}
      aria-checked={rule.isEnabled}
      role="switch"
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transform 
          transition-transform ease-in-out duration-300
          ${rule.isEnabled ? "translate-x-5" : "translate-x-0"}
        `}
      />
    </button>
  );

  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-b-0">
      {/* Rule Details and Toggle (Left Side) */}
      <div className="flex items-center space-x-4">
        <RuleToggle />
        <div className="pr-4">
          <h3 className="text-base font-medium text-gray-800">{rule.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{rule.condition}</p>
        </div>
      </div>

      {/* Action Buttons (Right Side) */}
      <div className="flex items-center space-x-4 text-sm font-medium text-gray-500">
        <button
          onClick={() => onEdit(rule)} // Call the new onEdit handler
          className="text-black transition-colors hover:bg-gray-100 rounded-md px-3 py-1"
        >
          Edit
        </button>

        <button
          onClick={() => onDelete(rule)} // Calls handler to open modal with rule object
          className="text-red-500 hover:text-red-700 transition-colors hover:bg-gray-100 rounded-md px-3 py-1"
          aria-label={`Delete ${rule.name} rule`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

/**
 * ManageRuleModal Component Definition (Handles both Add and Edit)
 */
const ManageRuleModal = ({
  isOpen,
  onClose,
  ruleState,
  ruleToEdit,
  onSave,
  onUpdate,
  CustomSelectComponent,
}) => {
  if (!isOpen && !ruleToEdit) return null; // Render only if adding (isOpen) or editing (ruleToEdit)

  // --- RULE CONFIGURATION DEFINITION ---
  const RULE_CONFIG = {
    "Order Amount": {
      operators: ["Greater than", "Less than", "Equals"],
      placeholder: "e.g., 200 (Numeric)",
      inputType: "number",
    },
    "Country/Region": {
      operators: ["Contains", "Equals"],
      placeholder: "e.g., United States (Text)",
      inputType: "text",
    },
    "Customer Full Name": {
      operators: ["Contains", "Equals"],
      placeholder: "e.g., John Smith (Text)",
      inputType: "text",
    },
    "Customer Email": {
      operators: ["Contains", "Equals"],
      placeholder: "e.g., @gmail.com (Text)",
      inputType: "text",
    },
    Address: {
      operators: ["Contains", "Equals"],
      placeholder: "e.g., 123 Main St (Text)",
      inputType: "text",
    },
    "Disposable Email": {
      operators: [],
      placeholder: "True/False (No Input)",
      inputType: "text",
    },
    "Payment Attempts": {
      operators: ["Greater than", "Less than", "Equals"],
      placeholder: "e.g., 2 (Numeric)",
      inputType: "number",
    },
    "Billing & IP Address Distance": {
      operators: ["Greater than", "Less than", "Equals"],
      placeholder: "e.g., 50 (Miles/Km - Numeric)",
      inputType: "number",
    },
    "VPN/Proxy Detected": {
      operators: [],
      placeholder: "True/False (No Input)",
      inputType: "text",
    },
  };
  // ------------------------------------

  const CONDITION_OPTIONS = Object.keys(RULE_CONFIG);

  // Determine if we are using the newRule state or parsing the ruleToEdit state
  const currentRuleData = ruleToEdit ? ruleState : ruleState;

  const selectedCondition = currentRuleData.condition;
  const config = RULE_CONFIG[selectedCondition];

  const isSpecialCase =
    selectedCondition === "Disposable Email" ||
    selectedCondition === "VPN/Proxy Detected";
  const showOperatorAndValue =
    selectedCondition !== "Select condition" && !isSpecialCase;

  // Validation: Save is enabled if it's a simple case, or if operator/value are set
  const isSaveEnabled =
    selectedCondition &&
    (isSpecialCase || (currentRuleData.operator && currentRuleData.value));

  const currentOperators = config ? config.operators : [];
  const currentPlaceholder = config ? config.placeholder : "";
  const currentInputType = config ? config.inputType : "text";

  const modalTitle = ruleToEdit
    ? "Edit Custom Hold Rule"
    : "Add Custom Hold Rule";

  return (
    // Modal Overlay
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {/* Modal Content Box */}
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg mx-4 p-6">
        {/* Header */}
        <div className="flex justify-between items-start border-b pb-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-900">{modalTitle}</h2>
          <button
            onClick={onClose}
            className="text-2xl text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        {/* Body - Condition Row */}
        <div className="mb-4 flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700 w-24">
            Condition
          </span>
          <div className="flex-1 min-w-[300px]">
            <CustomSelectComponent
              value={currentRuleData.condition}
              onChange={(val) => {
                onUpdate("condition", val);
                onUpdate("operator", "");
                onUpdate("value", "");
              }}
              options={CONDITION_OPTIONS}
            />
          </div>
        </div>

        {/* Body - Operator Row (Conditional) */}
        {showOperatorAndValue && (
          <div className="mb-4 flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700 w-24">
              Operator
            </span>
            <div className="flex-1 min-w-[300px]">
              <CustomSelectComponent
                value={currentRuleData.operator || "Select operator"}
                onChange={(val) => onUpdate("operator", val)}
                options={currentOperators}
              />
            </div>
          </div>
        )}

        {/* Body - Value Row (Conditional) */}
        {showOperatorAndValue && (
          <div className="mb-8 flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700 w-24">
              Value
            </span>
            <input
              type={currentInputType}
              value={currentRuleData.value}
              onChange={(e) => onUpdate("value", e.target.value)}
              className="flex-1 min-w-[300px] p-2.5 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder={currentPlaceholder}
            />
          </div>
        )}

        {/* Footer / Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(currentRuleData)}
            disabled={!isSaveEnabled}
            className={`px-4 py-2 text-white font-medium rounded-md transition-colors ${
              isSaveEnabled
                ? "bg-black hover:bg-gray-800"
                : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Reusable component for settings that include a risk score threshold.
 */
const ThresholdSetting = ({
  title,
  description,
  scoreLabel,
  range,
  threshold,
  onThresholdChange,
  isEnabled,
  onToggle,
}) => {
  const inequality = scoreLabel.includes("≤") ? "≤" : "≥";
  const actionText = title.includes("approve")
    ? "auto-approved"
    : "auto-cancelled";
  const [minRange, maxRange] = range.split("-");

  return (
    <div className="py-4 last:border-b border-gray-100">
      {/* Title and Toggle */}
      <div className="flex items-start justify-between">
        <div className="pr-4">
          <h3 className="text-base font-medium text-gray-800">{title}</h3>
          <p className="text-sm text-gray-500 mt-1 mb-3">{description}</p>
        </div>
        <ToggleSetting
          isEnabled={isEnabled}
          onToggle={onToggle}
          title=""
          description=""
        />
      </div>

      {/* Input Field and Details */}
      {isEnabled && (
        <div className="flex items-center mt-2 pl-1">
          <span className="text-sm font-medium text-gray-700 mr-2">
            {scoreLabel}
          </span>
          <input
            type="number"
            min={minRange}
            max={maxRange}
            value={threshold}
            onChange={(e) => onThresholdChange(e.target.value)}
            className="w-16 p-2 border border-gray-300 rounded-md text-center text-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
          <span className="text-sm text-gray-500 ml-3">
            Orders with score {inequality}
            {threshold} will be {actionText} ({range})
          </span>
        </div>
      )}
    </div>
  );
};

// --- Main Page Component ---

export default function AutomationPage() {
  // State for Automated Actions
  const [isLowRiskApproved, setIsLowRiskApproved] = useState(true);
  const [lowRiskThreshold, setLowRiskThreshold] = useState(40);
  const [isHighRiskCancelled, setIsHighRiskCancelled] = useState(true);
  const [highRiskThreshold, setHighRiskThreshold] = useState(70);

  // ✅ AUTO-SAVE: runs whenever any setting changes
  useEffect(() => {
    async function saveSettings() {
      await fetch("/api/automation/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isLowRiskApproved,
          lowRiskThreshold,
          isHighRiskCancelled,
          highRiskThreshold,
          shop,
        }),
      });
    }

    saveSettings();
  }, [
    isLowRiskApproved,
    lowRiskThreshold,
    isHighRiskCancelled,
    highRiskThreshold,
  ]);

  // State for Post-Cancellation Actions
  const [autoRestock, setAutoRestock] = useState(true);
  const [sendCancellationEmail, setSendCancellationEmail] = useState(true);

  // normalize shop from router query
  const { shop, host } = useRouter().query;
  const shopDomain =
    typeof shop === "string" ? shop : Array.isArray(shop) ? shop[0] : undefined;

  // State for Hold Timeout
  const [isHoldTimeoutEnabled, setIsHoldTimeoutEnabled] = useState(true);
  const [timeoutDays, setTimeoutDays] = useState(7);
  const [timeoutAction, setTimeoutAction] = useState(
    "Auto-cancel after 7 days"
  );

  useEffect(() => {
    if (!timeoutDays || !timeoutAction || !shopDomain) return;

    const saveSettings = async () => {
      try {
        const normalizeTimeoutAction = (label) => {
          if (label.toLowerCase().includes("approve")) return "approve";
          if (label.toLowerCase().includes("cancel")) return "cancel";
          return null;
        };

        const action = normalizeTimeoutAction(timeoutAction);

        if (!action) {
          console.error("Invalid timeoutAction value:", timeoutAction);
          return;
        }

        const res = await fetch("/api/automation/timeout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-shopify-shop-domain": shopDomain,
          },
          body: JSON.stringify({
            timeoutDays,
            timeoutAction: action, // ✅ fixed
            shop: shopDomain,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          console.error("Backend rejected:", err);
          return;
        }

        console.log("Settings auto-saved ✅");
      } catch (err) {
        console.error("Auto-save failed ❌", err);
      }
    };

    saveSettings();
  }, [timeoutDays, timeoutAction, shopDomain]);

  // State for Customer Verification
  const [autoApproveVerified, setAutoApproveVerified] = useState(false);
  const [autoCancelUnverified, setAutoCancelUnverified] = useState(false);
  const [autoReminderEmails, setAutoReminderEmails] = useState(false);
  const [activeTab, setActiveTab] = useState("automated_actions");

  // State for nested Auto Approve settings
  const [verificationMethods, setVerificationMethods] = useState({
    emailQnA: true,
    bankStatement: true,
    smsVerification: true,
  });
  const [approvalLogic, setApprovalLogic] = useState("ANY"); // 'ANY' or 'ALL'

  // State for nested Auto-Reminder settings
  const [reminderFrequency, setReminderFrequency] = useState(2);
  const [maximumReminders, setMaximumReminders] = useState(3);

  // -------------------------------------------------------------------
  // CUSTOM RULES STATE & HANDLERS
  // -------------------------------------------------------------------
  const [customRules, setCustomRules] = useState([
    {
      id: 1,
      name: "Country/Region",
      condition: 'Country equals "BRAZIL"',
      isEnabled: true,
    },
  ]);

  // Modals/Management States
  const [ruleToDelete, setRuleToDelete] = useState(null);
  const [ruleToEdit, setRuleToEdit] = useState(null); // <--- Rule being edited
  const [isAddRuleModalOpen, setIsAddRuleModalOpen] = useState(false); // Used only to signal NEW rule addition

  const [autoCancelUnverifiedLoading, setAutoCancelUnverifiedLoading] =
    useState(false);
  const [autoApproveVerifiedLoading, setAutoApproveVerifiedLoading] =
    useState(false);

 const handleAutoActionChange = async (action, value) => {
  console.log("[AUTO ACTION] Toggling:", action, "New Value:", value);

  if (!shop || typeof shop !== 'string') return;
  let setLoadingFn;

  if (action === 'autoCancelUnverified') setLoadingFn = setAutoCancelUnverifiedLoading;
  else if (action === 'autoApproveVerified') setLoadingFn = setAutoApproveVerifiedLoading;
  else setLoadingFn = () => {};

  setLoadingFn(true);

  const prevValue =
    action === 'autoCancelUnverified' ? autoCancelUnverified :
    autoApproveVerified;

  // Optimistic UI update
  if (action === 'autoCancelUnverified') setAutoCancelUnverified(value);
  else if (action === 'autoApproveVerified') setAutoApproveVerified(value);

  console.log("[AUTO ACTION] Sending to server:", {
    settingType: "autoAction",
    riskLevel: value,
    actionType: action
  });

  try {
    const res = await fetch('/api/settings/risk-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shopify-shop-domain': shop
      },
      body: JSON.stringify({
        settingType: 'autoAction',
        riskLevel: value,
        actionType: action,
        shop
      }),
    });

    console.log("[AUTO ACTION] Server response:", await res.json());
  } catch (err) {
    console.error("[AUTO ACTION] Error:", err);

    // Rollback UI
    if (action === 'autoCancelUnverified') setAutoCancelUnverified(prevValue);
    else if (action === 'autoApproveVerified') setAutoApproveVerified(prevValue);
  } finally {
    setLoadingFn(false);
  }
};

  // normalize shop from router query

  const handleAutoRestockToggle = async (value) => {
    console.log("AUTO RESTOCK FRONTEND TOGGLE VALUE:", value);
    setAutoRestock(value); // optimistic update

    if (!shopDomain) {
      // router not hydrated yet — either skip saving or queue it
      console.warn("shop query not ready; skipping save for now");
      return;
    }

    try {
      await fetch("/api/settings/risk-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shopify-shop-domain": shopDomain, // safe string
        },
        body: JSON.stringify({
          settingType: "autoAction",
          actionType: "autoRestockCancelledOrders",
          riskLevel: value,
          shop: shopDomain,
        }),
      });
    } catch (err) {
      console.error("Failed to save autoRestock setting:", err);
      setAutoRestock(!value); // revert optimistic update
    }
  };

  useEffect(() => {
    // ✅ Auto-save automation settings whenever these values change
    if (reminderFrequency && maximumReminders) {
      console.log("[Automation] Detected setting change:", {
        reminderFrequency,
        maximumReminders,
        autoReminderEmails,
      });

      const saveSettings = async () => {
        try {
          console.log("[Automation] Saving automation settings to server...");
          const res = await fetch("/api/automation/updateEmailSettings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shop,
              reminderFrequency,
              maximumReminders,
              autoReminderEmails,
            }),
          });

          const data = await res.json();
          console.log("[Automation] Server response:", data);
        } catch (err) {
          console.error("[Automation] Failed to save settings:", err);
        }
      };

      saveSettings();
    }
  }, [reminderFrequency, maximumReminders, autoReminderEmails]);

  // State for rule data being edited or added
  const [newRule, setNewRule] = useState({
    condition: "Order Amount",
    operator: "",
    value: "",
  });

  // Rule Formatting Helper (Used for both add/edit save logic)
  const formatRuleCondition = (ruleData) => {
    let isSimpleCase =
      ruleData.condition === "Disposable Email" ||
      ruleData.condition === "VPN/Proxy Detected";
    if (isSimpleCase) {
      return "Is TRUE";
    } else {
      // This is simplified formatting. In a real app, you'd parse operator/value precisely.
      return `${ruleData.condition} ${ruleData.operator} "${ruleData.value}"`;
    }
  };

  // HANDLERS
  const openDeleteModal = (rule) => {
    setRuleToDelete(rule);
  };

  const openEditModal = (rule) => {
    setRuleToEdit(rule);
    // Logic to parse existing rule condition (simplified placeholder logic here)
    // In a real app, you'd parse rule.condition to populate operator/value
    setNewRule({
      condition: rule.name,
      operator: "Equals", // Placeholder
      value: rule.condition.split('"')[1].split('"')[0] || "", // Placeholder for "BRAZIL"
    });
  };

  const openAddRuleModal = () => {
    setIsAddRuleModalOpen(true);
    setRuleToEdit(null); // Ensure we are in ADD mode
    setNewRule({
      condition: "Order Amount",
      operator: "",
      value: "",
    });
  };

  const handleNewRuleChange = (field, value) => {
    setNewRule((prev) => ({ ...prev, [field]: value }));
  };

  const handleCloseManageModal = () => {
    setIsAddRuleModalOpen(false);
    setRuleToEdit(null);
  };

  const handleSaveRule = (ruleData) => {
    if (ruleToEdit) {
      // 1. EDIT Logic
      const updatedRules = customRules.map((r) =>
        r.id === ruleToEdit.id
          ? {
              ...r,
              name: ruleData.condition,
              condition: formatRuleCondition(ruleData),
            }
          : r
      );
      setCustomRules(updatedRules);
    } else {
      // 2. ADD Logic
      const newId =
        customRules.length > 0 ? customRules[customRules.length - 1].id + 1 : 1;
      const ruleToSave = {
        id: newId,
        name: ruleData.condition,
        condition: formatRuleCondition(ruleData),
        isEnabled: true,
      };
      setCustomRules((prev) => [...prev, ruleToSave]);
    }
    handleCloseManageModal();
  };

  const confirmDelete = (id) => {
    setCustomRules(customRules.filter((rule) => rule.id !== id));
    setRuleToDelete(null);
  };

  const toggleRule = (id) => {
    setCustomRules(
      customRules.map((rule) =>
        rule.id === id ? { ...rule, isEnabled: !rule.isEnabled } : rule
      )
    );
  };
  // -------------------------------------------------------------------

  const CheckboxOption = ({ label, isChecked, onChange }) => (
    <label className="flex items-center text-sm text-gray-700 py-1 cursor-pointer">
      <input
        type="checkbox"
        checked={isChecked}
        onChange={onChange}
        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-2"
      />
      {label}
    </label>
  );

  // CustomSelect Component Definition
  const CustomSelect = ({ value, onChange, options }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Closes the dropdown when a click occurs outside the component
    useEffect(() => {
      function handleClickOutside(event) {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target)
        ) {
          setIsOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);

    const handleSelect = (option) => {
      onChange(option);
      setIsOpen(false);
    };

    return (
      <div
        className="relative inline-block w-full min-w-[350px]"
        ref={dropdownRef}
      >
        {/* Dropdown Button (Matches the top box in your image) */}
        <button
          type="button"
          className="w-full p-2.5 bg-white border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 
                     flex justify-between items-center"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          {value}
          {/* Chevron Icon that rotates */}
          <ChevronDownIcon
            className={`w-4 h-4 ml-2 text-gray-400 transition-transform ${
              isOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>

        {/* Options List (Matches the stylized list box in your image) */}
        {isOpen && (
          <ul
            className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl 
                       max-h-60 overflow-auto focus:outline-none"
            role="listbox"
          >
            {options.map((option) => (
              <li
                key={option}
                className={`text-sm text-gray-900 cursor-pointer select-none relative py-2 pl-3 pr-9 
                            hover:bg-gray-100 ${
                              option === value ? "bg-gray-50" : ""
                            }`}
                onClick={() => handleSelect(option)}
                role="option"
                aria-selected={option === value}
              >
                <div className="flex items-center">
                  {option === value && (
                    <span className="absolute inset-y-0 left-2 flex items-center pr-3">
                      <CheckIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                  <span className="truncate ml-5">{option}</span>
                  {/* Checkmark Icon */}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar host={String(host)} shop={String(shop)} />
      <main className="flex flex-col w-full max-w-[60vw] py-8 px-20 mx-auto">
        <Head>
          <title>Automation Settings</title>
        </Head>

        {/* Header - Corrected Structure */}
        <div className="mb-3">
          {" "}
          {/* Main container for the entire header block */}
          <div className="flex items-center mb-1">
            {" "}
            {/* Flex container for icon and title */}
            {/* Icon Container: The blue rounded square */}
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center mr-3 flex-shrink-0">
              <Bot className="text-white" size={20} />
            </div>
            {/* Title: Automation */}
            <h1 className="text-2xl font-semibold text-gray-900">Automation</h1>
          </div>
          {/* Subheading: On a separate line below the main heading */}
          <p className="text-gray-500 text-base mt-1">
            Configure automated actions and custom rules
          </p>
        </div>

        {/* Tabs */}
        <div
          className="flex w-full border-b border-slate-200 mb-6 bg-black justify-around mt-4"
          style={{
            backgroundColor: "rgb(241 245 249 / 1)",
            borderRadius: "0.5rem",
          }}
        >
          <button
            className={`w-full flex justify-center items-center px-6 py-2 text-sm font-medium transition-colors text-center ${
              activeTab === "automated_actions"
                ? "bg-white px-20 m-1.5 rounded-lg shadow-md"
                : "text-slate-600 hover:text-slate-800"
            }`}
            onClick={() => setActiveTab("automated_actions")}
          >
            <CircleCheck size={20} className="mr-2" />
            Automated Actions
          </button>
          {/* <button
            className={`w-1/2 text-center flex items-center px-6 py-2 text-sm font-medium transition-colors justify-center ${
              activeTab === "custom_rules"
                ? "bg-white px-100 m-1.5 rounded-lg shadow-md"
                : "text-slate-600 hover:text-slate-800"
            }`}
            onClick={() => setActiveTab("custom_rules")}
          >
            <TriangleAlert size={20} className="mr-2" />
            Custom Rules
          </button> */}
        </div>

        {/* --- CONTENT AREA START --- */}

        {/* --- 1. Automated Actions Card (Visible when activeTab is 'automated_actions') --- */}
        {activeTab === "automated_actions" && (
          <>
            <div className="bg-white shadow-lg rounded-lg p-6 mb-8 border border-gray-100">
              <div className="flex items-center mb-4">
                {" "}
                <CircleCheck size={20} className="mr-2 text-red-500" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Automated Actions
                </h2>
              </div>

              <ThresholdSetting
                title="Automatically approve low-risk orders"
                description="Approvals are performed based on the FraudGuard risk score assigned to each order."
                scoreLabel="Score Threshold (≤)"
                range="1-60"
                threshold={lowRiskThreshold}
                onThresholdChange={setLowRiskThreshold}
                isEnabled={isLowRiskApproved}
                onToggle={() => setIsLowRiskApproved(!isLowRiskApproved)}
              />

              <ThresholdSetting
                title="Automatically cancel high-risk orders"
                description="Cancellations are performed based on the FraudGuard risk score assigned to each order."
                scoreLabel="Score Threshold (≥)"
                range="61-100"
                threshold={highRiskThreshold}
                onThresholdChange={setHighRiskThreshold}
                isEnabled={isHighRiskCancelled}
                onToggle={() => setIsHighRiskCancelled(!isHighRiskCancelled)}
              />

              <div className="h-px bg-gray-100 my-5"></div>

              {/* --- 2. Post-Cancellation Actions --- */}
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Post-Cancellation Actions
              </h3>

              <ToggleSetting
                title="Auto-restock inventory"
                description="Automatically return cancelled items back to inventory"
                isEnabled={autoRestock}
                onToggle={() => handleAutoRestockToggle(!autoRestock)}
              />

              <ToggleSetting
                title="Send cancellation email"
                description="Automatically notify customers when their order is cancelled"
                isEnabled={sendCancellationEmail}
                onToggle={() =>
                  setSendCancellationEmail(!setSendCancellationEmail)
                }
              />

              <div className="border-b border-gray-100 my-5"></div>

              {/* --- 3. Hold Timeout --- */}
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <span className="mr-2 text-md">
                      <Clock height={20} />
                    </span>
                    Hold Timeout
                  </h2>
                  <ToggleSetting
                    isEnabled={isHoldTimeoutEnabled}
                    onToggle={() =>
                      setIsHoldTimeoutEnabled(!isHoldTimeoutEnabled)
                    }
                    title=""
                    description=""
                  />
                </div>

                <p className="text-sm text-gray-500 mt-1 mb-4">
                  Automatically resolve orders that remain on Hold and not
                  verified after a specified number of days.
                </p>

                {isHoldTimeoutEnabled && (
                  <div className="pl-1">
                    <div className="flex my-3 flex-col ml-5">
                      <span className="font-medium text-sm text-gray-700 min-w-[120px] mb-2">
                        Timeout Period
                      </span>
                      <span>
                        <input
                          type="number"
                          min="1"
                          max="7"
                          value={timeoutDays}
                          onChange={(e) =>
                            setTimeoutDays(parseInt(e.target.value))
                          }
                          className="w-14 p-2 border border-gray-300 rounded-md text-center text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <span className="text-sm text-gray-500 ml-2">
                          days (1-7)
                        </span>
                      </span>
                    </div>

                    <div className="mt-3">
                      <span className="block mb-2 font-medium text-sm text-gray-700 ml-5">
                        What happens after {timeoutDays} days?
                      </span>

                      <span className="ml-5">
                        <CustomSelect
                          value={timeoutAction}
                          onChange={setTimeoutAction}
                          options={[
                            `Auto-cancel after ${timeoutDays} days`,
                            `Auto-approve after ${timeoutDays} days`,
                          ]}
                        />
                        <p className="text-xs text-gray-500 mt-3 mb-4 ml-5">
                          Timer starts at the later of Hold started or the
                          verification email being sent. <br />
                          Uses the store timezone. <br />
                          Timer is canceled if the order is manually resolved or
                          verification is completed. <br />
                        </p>
                      </span>
                    </div>
                  </div>
                )}

                {/* Important Note */}
                <div className="mt-6 p-3 rounded-md bg-yellow-50 border border-yellow-300 text-sm text-yellow-800">
                  <div className="flex">
                    <span className="text-black text-lg mr-2">ⓘ</span>

                    <span>
                      <span className="font-bold mr-2"> Important:</span>
                      Custom Hold Rules will always override automatic approve
                      low risk orders. When a custom rule is triggered, the
                      order will be held for manual review regardless of other
                      automation settings.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* --- 4. Customer Verification Card --- */}
            <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-100 w-full mt-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="mr-2 text-sm text-purple-600">
                  <Mail />
                </span>
                Customer Verification
              </h2>

              {/* Auto Approve Verified Orders */}
              <ToggleSetting
                title="Auto approve verified orders"
                description="Automatically approve orders from customers who have completed verification, regardless of fraud score"
                isEnabled={autoApproveVerified}
                onToggle={() =>
                  handleAutoActionChange(
                    "autoApproveVerified",
                    !autoApproveVerified
                  )
                }
              />
              {/* NESTED SETTINGS for Auto Approve */}
              {autoApproveVerified && (
                <div className="mt-4 mb-4">
                  <div className="pl-6 border-l-2 border-gray-300 ml-5">
                    {/* Verification Methods */}
                    <h4 className="text-sm font-semibold text-gray-800 mt-2 mb-2 ">
                      Verification Methods
                    </h4>
                    <p className="text-xs text-gray-500 mb-2">
                      Select which verification methods will trigger
                      auto-approval
                    </p>
                    <div className="space-y-1">
                      <CheckboxOption
                        label="Last 4-Digits Image"
                        isChecked={verificationMethods.emailQnA}
                        onChange={() =>
                          setVerificationMethods((prev) => ({
                            ...prev,
                            emailQnA: !prev.emailQnA,
                          }))
                        }
                      />
                      {/* <CheckboxOption
                        label="2FA Bank Statement"
                        isChecked={verificationMethods.bankStatement}
                        onChange={() =>
                          setVerificationMethods((prev) => ({
                            ...prev,
                            bankStatement: !prev.bankStatement,
                          }))
                        }
                      /> */}
                      {/* <CheckboxOption
                        label="SMS Verification"
                        isChecked={verificationMethods.smsVerification}
                        onChange={() =>
                          setVerificationMethods((prev) => ({
                            ...prev,
                            smsVerification: !prev.smsVerification,
                          }))
                        }
                      /> */}
                    </div>

                    {/* Approval Logic
                    <h4 className="text-sm font-semibold text-gray-800 mt-4 mb-2">
                      Approval Logic
                    </h4>

                    <CustomSelect
                      value={
                        approvalLogic === "ANY"
                          ? "Approve if ANY selected method is verified"
                          : "Approve if ALL selected methods are verified"
                      }
                      onChange={(selectedText) => {
                        // Convert the selected text back to the state value ('ANY' or 'ALL')
                        if (selectedText.includes("ANY")) {
                          setApprovalLogic("ANY");
                        } else {
                          setApprovalLogic("ALL");
                        }
                      }}
                      options={[
                        "Approve if ANY selected method is verified",
                        "Approve only if ALL selected methods are verified",
                      ]}
                    />

                    <p className="text-xs text-gray-500 mt-1">
                      Order will be approved if the customer verifies using
                      {approvalLogic === "ANY" ? " any one" : " all"} of the
                      selected methods
                    </p> */}
                  </div>
                </div>
              )}

              {/* Auto Cancel Unverified Orders (No nested options shown in your image) */}
              <ToggleSetting
                title="Auto cancel unverified orders"
                description="Automatically cancel orders from customers who haven't completed verification, regardless of fraud score"
                isEnabled={autoCancelUnverified}
                onToggle={() =>
                  handleAutoActionChange(
                    "autoCancelUnverified",
                    !autoCancelUnverified
                  )
                }
              />
              <hr className="border-t border-gray-200 my-4" />
              {/* Auto-reminder verification emails */}

              <ToggleSetting
                title={
                  <span className="flex items-center">
                    {/* Hardcode the Clock icon here */}
                    <Clock className="w-4 h-4 mr-2" />
                    Auto-reminder verification emails
                  </span>
                }
                description="Send automatic reminder emails to customers who haven't completed verification"
                isEnabled={autoReminderEmails}
                onToggle={() => setAutoReminderEmails(!autoReminderEmails)}
              />
              <hr className="border-t border-gray-200 my-4" />

              {/* NESTED SETTINGS for Auto-reminder emails */}
              {autoReminderEmails && (
                <div className="pl-6 pt-2 pb-4 ">
                  <div className="flex items-center gap-48">
                    {/* Reminder Frequency */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">
                        Reminder Frequency
                      </h4>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-700 mr-2">
                          Every
                        </span>
                        <input
                          type="number"
                          min="1"
                          max="2"
                          value={reminderFrequency}
                          onChange={(e) =>
                            setReminderFrequency(parseInt(e.target.value) || 1)
                          }
                          className="w-16 p-2 border border-gray-300 rounded-md text-center text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <span className="text-sm text-gray-700 ml-2">days</span>
                      </div>
                    </div>

                    {/* Maximum Reminders */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">
                        Maximum Reminders
                      </h4>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-700 mr-2">
                          Stop after
                        </span>
                        <input
                          type="number"
                          min="1"
                          max="3"
                          value={maximumReminders}
                          onChange={(e) =>
                            setMaximumReminders(parseInt(e.target.value) || 1)
                          }
                          className="w-16 p-2 border border-gray-300 rounded-md text-center text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <span className="text-sm text-gray-700 ml-2">
                          reminders
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Timeline Note */}
                  <div className="p-3 bg-blue-50 border-2 border-blue-100 text-sm text-blue-800 mt-4 rounded">
                    <span className="font-semibold">Timeline:</span> Reminders
                    will be sent every {reminderFrequency} days, up to{" "}
                    {maximumReminders} times total. After that, no more
                    automatic reminders will be sent.
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Content for Custom Rules Tab (Visible when activeTab is 'custom_rules') */}
        {activeTab === "custom_rules" && (
          <>
            {/* 1. Top Information Note (Blue Box) */}
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800 mb-6">
              <div className="flex items-start">
                <span className="text-lg mr-2">ⓘ</span>
                <span>
                  <span className="font-semibold">Note:</span> Orders with
                  FraudGuard risk score{" "}
                  <span className="font-bold text-blue-900">40 or higher</span>{" "}
                  and orders flagged as{" "}
                  <span className="font-bold text-blue-900">
                    Medium + High Risk by Shopify
                  </span>{" "}
                  are already automatically held.
                </span>
              </div>
            </div>

            {/* 2. Main Custom Rules Card */}
            <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-100 mb-8">
              {/* Card Header (Title and Add Rule Button) */}
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center">
                  <TriangleAlert size={20} className="mr-2 text-orange-500" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    Custom Hold Rules
                  </h2>
                  <span className="text-gray-400 ml-2 cursor-pointer">ⓘ</span>
                </div>
                <button
                  onClick={openAddRuleModal} // Linked to open the new modal
                  className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium flex items-center hover:bg-gray-800 transition-colors"
                >
                  <span className="text-xl mr-1">+</span> Add Rule
                </button>
              </div>

              <p className="text-gray-500 text-sm mb-4">
                Create custom rules to automatically hold orders for manual
                review based on specific conditions.
              </p>

              {/* 3. List of Custom Rules */}
              <div className="space-y-0.5 border border-gray-100 rounded-md">
                <div className="px-4">
                  {customRules.map((rule) => (
                    <CustomRule
                      key={rule.id}
                      rule={rule}
                      onToggle={() => toggleRule(rule.id)}
                      onDelete={openDeleteModal} // Linked to open the delete confirmation modal
                      onEdit={openEditModal} // Linked to open the edit modal
                    />
                  ))}
                  {customRules.length === 0 && (
                    <p className="text-gray-400 text-sm italic pt-4">
                      No custom rules defined yet. Click "Add Rule" to begin.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- MODAL RENDERING --- */}
        <ConfirmDeleteModal
          rule={ruleToDelete}
          onConfirm={confirmDelete}
          onCancel={() => setRuleToDelete(null)}
        />

        {/* The Manage Rule Modal (Handles both Add and Edit) */}
        <ManageRuleModal
          isOpen={isAddRuleModalOpen || !!ruleToEdit}
          onClose={handleCloseManageModal}
          ruleState={ruleToEdit ? newRule : newRule}
          ruleToEdit={ruleToEdit} // Pass the rule object if editing
          onUpdate={handleNewRuleChange}
          onSave={handleSaveRule}
          CustomSelectComponent={CustomSelect}
        />
      </main>
    </div>
  );
}
