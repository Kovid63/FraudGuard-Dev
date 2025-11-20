import axios from "axios";

export async function makeApiRequest(endpoint, data, ignoreErrors = false) {
  try {
    const response = await axios.post(
      `${process.env.HOST}/api/${endpoint}`,
      data,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.data;
  } catch (error) {
    const errorMessage =
      error.response?.data?.error || error.message || "Unknown error";

    if (ignoreErrors) {
      console.warn(
        `Ignored non-critical /api/${endpoint} fetch error:`,
        errorMessage,
        { category: "scheduled-tasks" }
      );
      return { success: false, error: errorMessage };
    }

    console.error(
      `Error in makeApiRequest for /api/${endpoint}:`,
      errorMessage,
      { category: "scheduled-tasks" }
    );
    throw error;
  }
}
