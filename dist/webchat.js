(function() {
  const currentScript = document.currentScript;
  const tenantId = currentScript.getAttribute('data-tenant-id');

  if (!tenantId) {
    console.error('Webchat: data-tenant-id attribute is required.');
    return;
  }

  // Inject Styles
  const style = document.createElement('style');
  style.innerHTML = `
    #webchat-widget-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    #webchat-widget-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background-color: #007bff;
      color: white;
      border: none;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      cursor: pointer;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: transform 0.2s;
    }
    #webchat-widget-button:hover {
      transform: scale(1.05);
    }
    #webchat-widget-iframe-container {
      display: none;
      width: 350px;
      height: 500px;
      border-radius: 12px;
      box-shadow: 0 5px 25px rgba(0,0,0,0.2);
      overflow: hidden;
      margin-bottom: 20px;
      background: white;
      border: 1px solid #eaeaea;
    }
    #webchat-widget-iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    @media (max-width: 480px) {
      #webchat-widget-iframe-container {
        width: 100vw;
        height: 100vh;
        position: fixed;
        bottom: 0;
        right: 0;
        margin-bottom: 0;
        border-radius: 0;
        z-index: 1000000;
        display: none;
      }
      #webchat-widget-container {
        bottom: 10px;
        right: 10px;
      }
    }
  `;
  document.head.appendChild(style);

  // Parse origin to construct iframe url
  const scriptUrl = new URL(currentScript.src);
  const baseUrl = scriptUrl.origin;

  // Create Container
  const container = document.createElement('div');
  container.id = 'webchat-widget-container';

  // Create Iframe Container
  const iframeContainer = document.createElement('div');
  iframeContainer.id = 'webchat-widget-iframe-container';

  const iframe = document.createElement('iframe');
  iframe.id = 'webchat-widget-iframe';
  iframe.src = `${baseUrl}/webchat?tenantId=${tenantId}`;
  
  iframeContainer.appendChild(iframe);
  
  // Create Button
  const button = document.createElement('button');
  button.id = 'webchat-widget-button';
  button.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
  
  let isOpen = false;
  button.onclick = () => {
    isOpen = !isOpen;
    if (isOpen) {
      iframeContainer.style.display = 'block';
      button.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    } else {
      iframeContainer.style.display = 'none';
      button.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    }
  };

  container.appendChild(iframeContainer);
  container.appendChild(button);
  
  if (document.body) {
    document.body.appendChild(container);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(container);
    });
  }
})();
