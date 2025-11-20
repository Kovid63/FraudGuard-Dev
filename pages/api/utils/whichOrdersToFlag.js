export const whichOrdersToFlag = (riskLevel, riskSettings) => {
    const { risk, reason } = riskLevel;
    const { flagHighRisk, flagMediumRisk } = riskSettings;

    // Flag orders with past fraudulent behavior regardless of risk level
    // if (reason && reason.includes('Past fraudulent behaviour.')) {
    //     return true;
    // }

    // Normal risk-based flagging
    if (risk === 'high' || risk === 'high-medium' && flagHighRisk) return true;
    if (risk === 'medium' || risk === 'low-medium' && flagMediumRisk) return true;

    return false;
};
