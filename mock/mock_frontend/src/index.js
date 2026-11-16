import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Restaurante from './Restaurante';
import reportWebVitals from './reportWebVitals';

// Dois "apps" no mesmo mock: / é o cliente pedindo comida e /restaurante é o portal de parceiro
const Pagina = window.location.pathname.startsWith('/restaurante') ? Restaurante : App;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Pagina />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
