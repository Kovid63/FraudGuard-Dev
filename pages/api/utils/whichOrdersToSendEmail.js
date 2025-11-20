export const whichOrdersToSendEmail = (riskLevel, riskSettings) => {
    const { risk } = riskLevel;
    const { emailHighRisk, emailMediumRisk } = riskSettings;

    if (risk === 'high' || risk === 'high-medium' && emailHighRisk) return true;
    if (risk === 'medium' || risk === 'low-medium' && emailMediumRisk) return true;

    return false;
};