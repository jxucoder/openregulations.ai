import './styles/main.css';
import { renderApp } from './components/app.js';

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  const app = document.getElementById('app');
  await renderApp(app);
});
