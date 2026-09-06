# Caça aos Bugs — Real-Time Multiplayer WebRTC & WebSocket

Um jogo multiplayer casual, rápido e interativo com estética de **Bullet Journal** (papel pontilhado), desenvolvido para rodar 100% no navegador (celular, tablet e computador) sem necessidade de instalação de aplicativos ou dependências externas pesadas.

---

## Propósito do Projeto

Este projeto nasceu da união de dois grandes objetivos:

1. **Diversão em Família e Amigos:** Criar um jogo acessível onde qualquer pessoa possa entrar instantaneamente clicando em um link pelo celular ou computador e competir em tempo real para ver quem esmaga mais insetos no caderno.
2. **Estudo Aprofundado de Redes e Mídia em Tempo Real:** Servir como um laboratório prático de engenharia web para explorar **WebRTC (DataChannel e Audio Tracks)** e **WebSockets nativos (RFC 6455)**, entendendo na prática como construir arquiteturas multiplayer de baixíssima latência, chat de voz P2P e alta performance com isolamento de salas.

---

## Arquitetura e Engenharia de Redes

### 1. Arquitetura Híbrida: WebSocket + WebRTC Full Mesh
O projeto divide as responsabilidades em três camadas de rede complementares:

| Responsabilidade | Tecnologia | Por que foi escolhido? |
| :--- | :--- | :--- |
| **Salas, Rodadas, Bugs, Placar e Pausa** | **WebSocket (Servidor Node.js)** | Garante um **servidor autoritativo** para evitar trapaças e sincronizar com precisão o ciclo de vida da partida e validação de cliques. |
| **Movimento de Cursores e Cliques** | **WebRTC DataChannel (P2P)** | Envia coordenadas a **60 FPS** diretamente entre os navegadores dos jogadores com latência próxima de zero. |
| **Chat de Voz em Tempo Real** | **WebRTC Audio Tracks (P2P)** | Transmite áudio bidirecional (codec Opus) com cancelamento de eco e supressão de ruído sem sobrecarregar o servidor. |

```
                       [ SERVIDOR NODE.JS ]
             (Salas, Ciclo de Partida, Bugs, Placar)
                           ▲             ▲
                 WebSocket │             │ WebSocket
                           │             │
                    [ JOGADOR 1 ] ◄════► [ JOGADOR 2 ]
                        WebRTC DataChannel (Cursores 60 FPS)
                        WebRTC Audio Tracks (Chat de Voz P2P)
```

### 2. Multi-Salas e Isolamento da Topologia Full Mesh O(N^2)
Em conexões WebRTC P2P *Full Mesh* (onde cada participante se conecta diretamente a todos os outros), o número de conexões cresce na proporção $O(N^2)$:

$$\text{Conexões na sala} = \frac{N \times (N - 1)}{2}$$

Para evitar sobrecarga de rede e processamento em celulares:
* O jogo é dividido em **Salas Isoladas em Memória RAM**.
* **Limite estrito de 8 jogadores por sala:** Garante no máximo 28 conexões P2P diretas, mantendo o consumo de banda baixo (~350 Kbps) e 60 FPS estáveis até em smartphones modestos.
* **Autolimpeza de Memória (Garbage Collection):** Quando o último participante de uma sala desconecta, o loop da sala é encerrado e a instância é removida da memória RAM automaticamente.

### 3. Protocolo WebSocket Nativo (RFC 6455) & Keepalive
O backend foi construído em **Node.js puro**, sem bibliotecas externas como `ws` ou `socket.io`:
* Handshake HTTP com cálculo de `Sec-WebSocket-Accept` via SHA-1;
* Decodificação de frames binários de WebSocket (máscaras de payload, opcodes de texto, ping, pong e close);
* Keepalive bidirecional: o servidor emite frames de Ping RFC 6455 (`0x89`) a cada 15 segundos para encerrar sockets mortos e evitar timeouts de NAT de operadoras.

### 4. Resiliência de Ciclo de Vida e Reconexão Zero-Refresh
* **Detecção de Abas e Segundo Plano:** Monitoramento unificado de `visibilitychange`, `pageshow` e `resume` (Page Lifecycle API).
* **Sessão Persistente:** Identificador `sessionId` armazenado em `sessionStorage` com buffer de tolerância de 15 segundos no backend, restaurando pontuação, nome e cor ao reconectar sem necessidade de recarregar a página (F5).
* **Indicador Visual de Reconexão:** Badge discreto de status no topo da tela durante oscilações de rede.

### 5. Chat de Voz P2P e Detecção de Atividade de Voz (VAD)
* **Controles Integrados na Interface:** Botões dedicados no canto inferior esquerdo para mutar microfone e ensurdecer alto-falante.
* **Detecção de Voz em Tempo Real:** Análise espectral de volume via Web Audio API (`AnalyserNode`), destacando visualmente o cursor do jogador que estiver falando e sinalizando no placar.
* **Compatibilidade Mobile e HTTPS:** Suporte a políticas restritivas de áudio e exigências de contexto seguro (HTTPS) no iOS Safari e Android Chrome.

### 6. Sucessão Determinística de Admin Master
* Atribuição de índice monotônico de entrada (`joinIndex`) por jogador.
* Caso o Admin Master se desconecte, o servidor transfere a liderança instantaneamente para o segundo jogador mais antigo da sala, sincronizando os botões de administração e placar em tempo real.

---

## Mecânicas do Jogo

* **Multi-Salas com Lobby em Tempo Real:** 
  - Acesse a raiz (`/`) para listar as salas ativas, criar uma sala aleatória (ex: `bug-429`) ou entrar informando um código.
  - Links diretos com `?room=nome-da-sala` conectam diretamente à sala.
* **Início Manual pelo Admin Master:**
  - A partida só inicia com a confirmação manual do criador da sala, sem reinício automático indesejado.
* **Contagem Regressiva de 6 Segundos:**
  - Antes de qualquer rodada (1, 2 e 3), um contador regressivo prepara todos os jogadores para a ação.
* **3 Rodadas de 20 Segundos:**
  - **Rodada 1:** Invasão moderada de insetos.
  - **Rodada 2:** Invasão acelerada com duplas de bugs.
  - **Rodada 3 (Modo Caos):** Velocidade dobrada e dezenas de insetos rastejando pela tela.
* **Bug Dourado (Bônus Rápido):**
  - Surge exatamente 1 vez por rodada em velocidade superior.
  - Pontuação escalonada:
    - **Rodada 1:** **+2 pontos**
    - **Rodada 2:** **+6 pontos**
    - **Rodada 3:** **+12 pontos**
* **HUD Informativo:** Cronômetro flutuante, indicador de rodada e placar recolhível com indicação de voz ativa.
* **Painel de Controle do Admin:** Permissões exclusivas para pausar, retomar ou reiniciar a partida.

---

## Como Executar Localmente

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

## Como Fazer Deploy Gratuito

### Opção A: Railway (Recomendado para 24/7)
1. Suba este repositório no seu GitHub.
2. Acesse [railway.app](https://railway.app) e clique em **`+ New Project` -> `Deploy from GitHub repo`**.
3. Em **Settings -> Networking**, clique em **`Generate Domain`** para obter sua URL pública `https://...up.railway.app`.

### Opção B: Cloudflare Quick Tunnel (Instantâneo com HTTPS)
Com o servidor rodando localmente (`npm start`), execute em outro terminal:
```bash
npx cloudflared tunnel --url http://localhost:3000
```
Copie a URL `https://*.trycloudflare.com` gerada e envie para seus amigos. O túnel HTTPS permite testar o microfone em dispositivos móveis imediatamente.

---

## Tecnologias Utilizadas

* **Frontend:** HTML5, CSS3 moderno (Flexbox, Grid, Variáveis CSS, Safe Areas, Animações), Vanilla JavaScript (ES6+), HTML5 Canvas API, Pointer Events API, Web Audio API (`AnalyserNode`), Ícones Vetoriais SVG inline.
* **PWA de Alta Fidelidade:** Service Worker com cache offline e Stale-While-Revalidate, Web App Manifest completo (ícones normais e maskable 192x192 / 512x512, Apple Touch Icon 180x180), instalação in-app no Android/Desktop/iOS Safari, e página offline com mini-game de treino.
* **Comunicação em Tempo Real:** WebRTC (`RTCPeerConnection`, `RTCDataChannel`, `MediaStream Audio Tracks`), WebSockets nativos (RFC 6455).
* **Backend:** Node.js Nativo (`http`, `crypto`, `os`, `fs`, `path`). Zero frameworks externos.
* **Infraestrutura STUN:** Google Public STUN, Cloudflare STUN e Mozilla STUN.

---

## Licença

Este projeto foi desenvolvido para fins educacionais, de estudo e entretenimento. Sinta-se livre para clonar, estudar, modificar e se divertir!
