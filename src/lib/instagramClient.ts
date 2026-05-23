export async function sendMessage(recipientId: string, text: string, accessToken: string) {
  const url = `https://graph.facebook.com/v19.0/me/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: text },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Instagram API Error: ${res.status} - ${errorText}`);
  }

  return res.json();
}
