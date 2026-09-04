# Caça aos Bugs — Real-Time Multiplayer WebRTC & WebSocket

Um jogo multiplayer casual, rápido e interativo com estética de **Bullet Journal** (papel pontilhado), desenvolvido para rodar 100% no navegador (celular, tablet e computador) sem necessidade de instalação de aplicativos ou dependências pesadas.

---

## 🎯 Propósito do Projeto

Este projeto nasceu da união de dois grandes objetivos:

1. **Diversão em Família e Amigos:** Criar um joguinho acessível onde qualquer pessoa da família possa entrar instantaneamente apenas clicando em um link pelo celular ou computador e competir em tempo real para ver quem esmaga mais insetos no caderno.
2. **Estudo Aprofundado de Redes em Tempo Real:** Servir como um laboratório prático de engenharia web para explorar e comparar **WebRTC (Peer-to-Peer)** e **WebSockets**, entendendo na prática como construir arquiteturas multiplayer de baixíssima latência e alta performance com isolamento de salas.

---

## 🧠 Arquitetura e Engenharia de Redes

### 1. Arquitetura Híbrida: WebSocket + WebRTC
Em jogos multiplayer, nem todo dado precisa passar pelo servidor central. O projeto divide as responsabilidades em duas camadas:

| Responsabilidade | Tecnologia | Por que foi escolhido? |
| :--- | :--- | :--- |
| **Salas, Rodadas, Bugs, Placar e Pausa** | **WebSocket (Servidor Node.js)** | Garante um **servidor autoritativo** para evitar trapaças e sincronizar com precisão o início/fim das rodadas e quem acertou o bug primeiro. |
| **Movimento de Cursores e Cliques na Tela** | **WebRTC DataChannel (P2P)** | Envia coordenadas a **60 FPS** diretamente entre os navegadores dos jogadores, sem sobrecarregar a CPU ou a banda do servidor. |

```
                       [ SERVIDOR NODE.JS ]
             (Salas, Ciclo de Partida, Bugs, Placar)
                           ▲             ▲
                 WebSocket │             │ WebSocket
                           │             │
                    [ JOGADOR 1 ] ◄════► [ JOGADOR 2 ]
                             WebRTC DataChannel
                             (Cursores a 60 FPS)
```

### 2. Multi-Salas e Isolamento do Problema Quadrático $O(N^2)$
Em conexões WebRTC P2P *Full Mesh* (onde cada participante se conecta diretamente a todos os outros), o número de conexões cresce na proporção $O(N^2)$:

$$\text{Conexões na sala} = \frac{N \times (N - 1)}{2}$$

Para evitar que a rede e o processamento de celulares travem com muitos jogadores:
* O jogo é dividido em **Salas Isoladas em Memória RAM**.
* **Limite estrito de 8 jogadores por sala:** Garante no máximo 28 conexões P2P diretas, mantendo a taxa de transferência baixa (~350 Kbps) e 60 FPS estáveis até em smartphones modestos.
* **Autolimpeza de Memória (Garbage Collection):** Quando o último participante de uma sala desconecta, o loop da sala é encerrado e a instância é removida da memória RAM automaticamente.

### 3. Protocolo WebSocket Nativo (RFC 6455)
O backend foi construído em **Node.js puro**, sem bibliotecas externas como `ws` ou `socket.io`. Foram implementados manualmente:
* Handshake HTTP com cálculo de `Sec-WebSocket-Accept` via SHA-1;
* Decodificação de frames binários de WebSocket (máscaras de payload, opcodes de texto/ping/pong/close);
* Roteamento de mensagens e sinalização WebRTC restrita por sala.

### 4. Responsividade Mobile & Touch de Baixa Latência
* Eventos unificados de `pointerdown` e `pointermove` com eliminação do delay padrão de 300ms do toque no celular;
* Trajetórias normalizadas dinamicamente (`0.0` a `1.0`), permitindo que jogadores em telas de proporções diferentes (ex: iPhone retrato vs PC ultrawide) vejam os bugs nas mesmas posições relativas;
* **100% Ícones Vetoriais SVG:** Substituição de emojis por vetores padronizados para garantir consistência visual perfeita entre iOS, Android e desktop.

---

## 🎮 Mecânicas do Jogo

* **Multi-Salas com Lobby em Tempo Real:** 
  - Acesse a raiz (`/`) para ver as salas abertas no momento com contagem de jogadores (`X/8`), criar uma sala aleatória (ex: `bug-429`) ou entrar com código.
  - Links diretos com `?room=nome-da-sala` conectam direto à sala especificada.
* **Início Manual pelo Admin Master:**
  - A partida só inicia com a confirmação manual do criador da sala (Admin), sem reinício automático indesejado.
* **Delay Fixo de 6 Segundos:**
  - Antes de qualquer rodada (1, 2 e 3), um contador regressivo de 6 segundos aparece no centro da tela para todos os jogadores se prepararem.
* **3 Rodadas de 20 Segundos:**
  - **Rodada 1:** Invasão moderada de insetos.
  - **Rodada 2:** Invasão acelerada com duplas de bugs.
  - **Rodada 3 (Modo Caos):** Velocidade dobrada e dezenas de insetos rastejando pela tela.
* **Bug Dourado (Bônus Rápido):**
  - Surge **exatamente 1 vez por rodada** em velocidade superior.
  - Pontuação escalonada:
    - **Rodada 1:** **+2 pontos**
    - **Rodada 2:** **+6 pontos**
    - **Rodada 3:** **+12 pontos**
* **Cronômetro Sempre Visível:** HUD flutuante no topo que mantém a contagem de segundos ativa durante toda a partida sem cobrir os insetos.
* **Painel de Controle do Admin:** Apenas o Admin Master possui permissão de pausar, retomar ou reiniciar a partida.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
* [Node.js](https://nodejs.org/) instalado (versão 16 ou superior).

### Passo a passo
1. Clone o repositório:
   ```bash
   git clone https://github.com/SEU_USUARIO/NOME_DO_REPO.git
   cd NOME_DO_REPO
   ```

2. Inicie o servidor:
   ```bash
   npm start
   ```

3. Abra no navegador:
   * No seu computador: `http://localhost:3000`
   * No celular (mesmo Wi-Fi): `http://SEU_IP_LOCAL:3000`

---

## 🌐 Como Fazer Deploy Gratuito

### Opção A: Railway (Recomendado para 24/7)
1. Suba este repositório no seu GitHub.
2. Acesse [railway.app](https://railway.app) e clique em **`+ New Project` ➔ `Deploy from GitHub repo`**.
3. Em **Settings ➔ Networking**, clique em **`Generate Domain`** para obter sua URL pública `https://...up.railway.app`.

### Opção B: Cloudflare Quick Tunnel (Instantâneo)
Com o servidor rodando localmente (`npm start`), execute em outro terminal:
```bash
npx cloudflared tunnel --url http://localhost:3000
```
Copie a URL `https://*.trycloudflare.com` gerada e envie para seus amigos e família.

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:** HTML5, CSS3 moderno (Flexbox, Grid, Variáveis CSS, Animações), Vanilla JavaScript (ES6+), HTML5 Canvas API, Pointer Events API, Web Share API, Ícones Vetoriais SVG inline.
* **Comunicação em Tempo Real:** WebRTC (`RTCPeerConnection`, `RTCDataChannel`), WebSockets (RFC 6455 nativo).
* **Backend:** Node.js Nativo (`http`, `crypto`, `os`, `fs`, `path`). Zero frameworks externos.
* **Infraestrutura:** Google Public STUN (`stun:stun.l.google.com:19302`).

---

## 📄 Licença

Este projeto foi desenvolvido para fins educacionais, de estudo e entretenimento. Sinta-se livre para clonar, estudar, modificar e se divertir!
