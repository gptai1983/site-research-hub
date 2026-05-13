const sseClients: Map<string, Set<(data: string) => void>> = new Map();

export function addSSEClient(sessionId: string, sendFn: (data: string) => void) {
  if (!sseClients.has(sessionId)) {
    sseClients.set(sessionId, new Set());
  }
  sseClients.get(sessionId)!.add(sendFn);
}

export function removeSSEClient(sessionId: string, sendFn: (data: string) => void) {
  const clients = sseClients.get(sessionId);
  if (clients) {
    clients.delete(sendFn);
    if (clients.size === 0) {
      sseClients.delete(sessionId);
    }
  }
}

export function sendSSE(sessionId: string, data: any) {
  const clients = sseClients.get(sessionId);
  if (clients) {
    const message = JSON.stringify(data);
    clients.forEach(send => {
      try {
        send(message);
      } catch {
        clients.delete(send);
      }
    });
  }
}

export function broadcastToAll(data: any) {
  sseClients.forEach((clients, sessionId) => {
    const message = JSON.stringify({ ...data, sessionId });
    clients.forEach(send => {
      try {
        send(message);
      } catch {
        clients.delete(send);
      }
    });
  });
}