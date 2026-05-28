import express from "express";

const router = express.Router();

router.all("/proxy", async (req, res) => {
  const { path, method, body, evolutionUrl, evolutionApiKey } = req.body || {};

  if (!evolutionUrl || !evolutionApiKey || !path) {
    return res.status(400).json({ error: "Missing evolutionUrl, evolutionApiKey or path" });
  }

  if (evolutionUrl.includes("trycloudflare.com")) {
    console.warn("Ignoring dead trycloudflare Evolution URL:", evolutionUrl);
    return res.status(503).json({ error: "Evolution API not configured or using dead tunnel." });
  }

  // Sanitize the base URL (remove trailing slash) and path (ensure leading slash)
  const baseUrl = evolutionUrl.replace(/\/$/, "");
  const endpointPath = path.startsWith("/") ? path : `/${path}`;
  const targetUrl = `${baseUrl}${endpointPath}`;

  try {
    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey,
      },
    };

    if (body && Object.keys(body).length > 0 && method !== "GET" && method !== "HEAD") {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get("content-type");
    
    let data;
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Evolution API returned an error",
        status: response.status,
        details: data
      });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error("Evolution Proxy Error:", error);
    return res.status(500).json({ error: "Failed to connect to Evolution API", details: error.message });
  }
});

// Mock for webhook URLs
router.get("/fetch-history", (req, res) => {
  res.json({ messages: [] });
});

export const evolutionRouter = router;
