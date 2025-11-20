async function makeApiRequest(endpoint, data, ignoreErrors = false) {
  try {
    const response = await axios.post(
      `${process.env.HOST}/api/${endpoint}`,
      data,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    const responseData = response.data;
    return responseData;
  } catch (error) {
    const errorMessage =
      error.response?.data?.error || error.message || "Unknown error";
    if (ignoreErrors) {
      console.warn(
        `Ignored non-critical /api/${endpoint} fetch error:`,
        errorMessage,
        { category: "webhook-order-create" }
      );
      return { success: false, error: errorMessage };
    }
    console.error(
      `Error in makeApiRequest for /api/${endpoint}:`,
      errorMessage,
      { category: "webhook-order-create" }
    );
    throw error;
  }
}

export default makeApiRequest;