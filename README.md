# Backend - Ferramenta de Planejamento Financeiro

Este repositório contém o backend da aplicação, desenvolvido com Node.js, Fastify e Prisma.

## Arquitetura e Decisões Técnicas

A arquitetura do backend foi projetada com base nos seguintes princípios:

- **Model-First com Prisma:** O schema do banco de dados, definido em `prisma/schema.prisma`, é a fonte única da verdade para a estrutura de dados. Ele foi projetado primeiro para garantir consistência e gerar tipos seguros para toda a aplicação.
- **Separação de Convenções:** Adotei o uso de `@@map` e `@map` no schema do Prisma. Isso permite usar a convenção `PascalCase/camelCase` no código TypeScript, que são idiomáticas para o ambiente, enquanto mantenho a convenção `snake_case` no banco de dados PostgreSQL, que é o padrão da comunidade SQL.
- **Estrutura Relacional:** O banco de dados foi modelado de forma relacional para garantir a integridade dos dados. As principais relações são:
  - Um `Client` pode ter múltiplos `Goals`, `Events`, `Simulations` e `Insurances` (Relação 1-N).
  - Um `Client` possui uma única `Wallet` (Relação 1-1).
  - Um `User` está associado a um `Client`, permitindo que o próprio cliente (role `viewer`) acesse seus dados.
- **Separação de Autenticação e Dados de Domínio:** Foi criada uma distinção clara entre o modelo `User` (responsável por autenticação, senhas e papéis) e o modelo `Client` (responsável pelos dados de negócio do cliente). Isso melhora a segurança e a clareza do sistema.
- **Gerenciamento de Dados Estruturados (JSON):** Para campos que representam objetos complexos como `familyProfile` (perfil familiar), `assetClasses` (classes de ativos) e `projection` (dados da simulação), optei por usar o tipo `Json` do Prisma (mapeado para `jsonb` no PostgreSQL). Para garantir a integridade e o formato desses objetos, a validação não é delegada ao banco, mas sim garantida na camada da aplicação através de schemas **Zod**. Esta abordagem oferece um bom equilíbrio entre a flexibilidade de um schema dinâmico e a segurança de dados consistentes e tipados no código, evitando a complexidade de criar tabelas adicionais para cada um desses casos de uso. As estruturas esperadas são:
  - **`assetClasses`**: Um array de objetos, onde cada objeto representa uma classe de ativo. Ex:
    ```json
    [
      { "className": "Ações Nacionais", "percentage": 50.0 },
      { "className": "Renda Fixa", "percentage": 50.0 }
    ]
    ```
  - **`familyProfile`**: Um array de objetos, onde cada objeto representa um membro da família. Ex:
    ```json
    [
      {
        "relationship": "PARTNER",
        "name": "Maria Silva",
        "dateOfBirth": "1990-05-20T00:00:00.000Z"
      },
      {
        "relationship": "CHILD",
        "name": "Pedro Silva",
        "dateOfBirth": "2015-10-10T00:00:00.000Z"
      }
    ]
    ```
  - **`projection`**: Um array de objetos representando a projeção patrimonial anual. Ex:
    ```json
    [
      { "year": 2024, "projectedValue": 110000 },
      { "year": 2025, "projectedValue": 121500 }
    ]
    ```
- **Manuseio de Valores Monetários:** Para garantir a precisão absoluta em todos os cálculos financeiros e evitar erros de arredondamento inerentes aos tipos de ponto flutuante (`Float`), todos os campos que representam dinheiro (`targetValue`, `totalValue`, etc.) foram implementados usando o tipo `Decimal` do Prisma. Este tipo é mapeado para o tipo `NUMERIC` de precisão exata no PostgreSQL, que é o padrão da indústria para aplicações financeiras.
- **Identificadores de Entidade (UUID):** Para as chaves primárias de todas as tabelas principais, optei por usar UUIDs (Universally Unique Identifiers) em vez de inteiros autoincrementais. Esta abordagem aumenta a segurança ao não expor a contagem de registros, facilita a integração com sistemas distribuídos e previne conflitos de ID em cenários de importação de dados ou replicação. Os UUIDs são gerados pela aplicação no momento da criação do registro.
- **Otimização de Performance com Índices:** Para garantir consultas rápidas e uma experiência de usuário fluida, mesmo com um grande volume de dados, implementei índices estratégicos no banco de dados. A maioria das consultas na aplicação são filtradas por cliente e ordenadas por data. Portanto, criei **índices compostos** (ex: `(client_id, created_at)`) nas tabelas `Events`, `Goals`, `Simulations` e `Insurances`. Esses índices permitem que o banco de dados localize e ordene os registros de um cliente específico de forma extremamente eficiente, evitando "full table scans" e melhorando drasticamente a performance das leituras.
- **Autenticação Stateless com JWT:** O sistema utiliza JSON Web Tokens (JWT) para autenticação, seguindo uma abordagem _stateless_. Após o login, o cliente recebe um token assinado que contém o ID (`sub`) e o papel (`role`) do usuário. Este token é enviado no cabeçalho `Authorization` de cada requisição subsequente. O servidor valida o token sem precisar consultar o banco de dados para cada requisição, o que melhora a performance e a escalabilidade. O logout é gerenciado pelo cliente, que simplesmente descarta o token.
- **Modelo de Permissões Explícitas e Hooks de Autorização:** A segurança da API é garantida por um modelo de permissões explícito, implementado através de hooks reutilizáveis do Fastify. A autenticação (`authenticate`) e a autorização de papéis (`ensureAdvisor`) são desacopladas da lógica de negócio das rotas. Isso torna o código das rotas mais limpo, simplifica os testes e centraliza as regras de segurança, seguindo o princípio DRY (Don't Repeat Yourself). Rotas administrativas (`/users/:clientId`) e de perfil pessoal (`/me`) são intencionalmente separadas para maior clareza e segurança.

## Suposições e Esclarecimentos

Durante o desenvolvimento, algumas decisões foram tomadas com base em interpretações dos requisitos, uma vez que o case não especificava todos os detalhes. As principais suposições foram:

- **Criação do Modelo `Insurance`:** A seção `Entregáveis` não menciona essa tabela na migração inicial, porém, a funcionalidade `Perfis de Seguro` exige um local para armazenar os dados de cada seguro. Para isso, foi criado o modelo `Insurance`, que se relaciona com um `Client`.
- **Criação do Modelo `User`:** Para implementar a autenticação JWT com papéis (`advisor`, `viewer`) de forma segura e escalável, foi criado um modelo `User`. Este modelo armazena as credenciais de login e o papel do usuário, sendo distinto do modelo `Client`, que armazena os dados pessoais e financeiros.
- **Armazenamento de Idade vs. Data de Nascimento:** O case pedia para armazenar a "idade" do cliente. No entanto, armazenar uma idade como um número estático é uma má prática, pois o dado se torna obsoleto anualmente. Para garantir a precisão e a integridade dos dados ao longo do tempo, foi tomada a decisão de armazenar o campo `dateOfBirth` (data de nascimento). A idade é então calculada dinamicamente no backend sempre que necessário, garantindo que a informação seja sempre atual e precisa.
- **Estrutura do Modelo de Eventos (`Event`):** Para aumentar a robustez e a clareza, o campo que descreve o tipo de um evento foi dividido em duas partes: um campo `category` (um Enum que define o impacto financeiro: `INCOME` ou `EXPENSE`) e um campo `description` (um String para o contexto do usuário). Esta separação permite que o motor de projeção opere de forma segura com base na categoria, enquanto o usuário mantém a flexibilidade de descrever o evento detalhadamente.

## Endpoints da API

A documentação interativa completa da API está disponível via Swagger na rota `/docs` quando a aplicação está em execução. Abaixo está um resumo dos principais endpoints implementados.

---

### Sessões (`/sessions`)

Endpoints responsáveis pela autenticação e gerenciamento de sessões.

- **`POST /sessions`**
  - **Descrição:** Autentica um usuário e retorna um token JWT.
  - **Corpo da Requisição:** `{ "email": "string", "password": "string" }`
  - **Respostas:**
    - `200 OK`: `{ "token": "string" }` - Autenticação bem-sucedida.
    - `401 Unauthorized`: `{ "message": "string" }` - Credenciais inválidas.
  - **Acesso:** Público.

---

### Usuários (`/users` e `/me`)

Endpoints para o gerenciamento de contas de usuário e perfil pessoal.

- **`POST /users`**

  - **Descrição:** Cria um novo usuário (`ADVISOR` ou `VIEWER`).
  - **Corpo da Requisição:** `{ "email": "string", "password": "string", "role": "ADVISOR" | "VIEWER", "clientId?": "string" }`
  - **Respostas:**
    - `201 Created`: Objeto do usuário criado (sem a senha).
    - `409 Conflict`: `{ "message": "string" }` - E-mail já está em uso.
    - `404 Not Found`: `{ "message": "string" }` - `clientId` fornecido não existe.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`GET /users`**

  - **Descrição:** Lista todos os usuários do sistema com paginação.
  - **Query Params:** `?page=number&pageSize=number`
  - **Respostas:**
    - `200 OK`: Objeto paginado `{ "users": [...], "meta": { ... } }`.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`GET /users/:userId`**

  - **Descrição:** Retorna os dados de um usuário específico.
  - **Respostas:**
    - `200 OK`: Objeto do usuário (sem a senha).
    - `404 Not Found`: `{ "message": "string" }` - Usuário não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`GET /me`**

  - **Descrição:** Retorna os dados do usuário atualmente autenticado.
  - **Respostas:**
    - `200 OK`: Objeto do usuário (sem a senha).
    - `404 Not Found`: O usuário associado ao token não existe mais no banco.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** Qualquer usuário autenticado.

- **`PUT /users/:userId`**

  - **Descrição:** Atualiza os dados de um usuário específico.
  - **Corpo da Requisição:** Objeto com os campos a serem atualizados.
  - **Respostas:**
    - `200 OK`: Objeto do usuário atualizado.
    - `404 Not Found`: `{ "message": "string" }` - Usuário não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`DELETE /users/:userId`**
  - **Descrição:** Deleta um usuário específico.
  - **Respostas:**
    - `204 No Content`: Usuário deletado com sucesso.
    - `404 Not Found`: `{ "message": "string" }` - Usuário não encontrado.
    - `400 Bad Request`: `{ "message": "string" }` - Tentativa de auto-deleção.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

---

### Clientes (`/clients`)

Endpoints para o gerenciamento de dados de clientes. O acesso a todas estas rotas é restrito a usuários com o papel `ADVISOR`.

- **`POST /clients`**

  - **Descrição:** Cria um novo cliente no sistema.
  - **Corpo da Requisição:** `{ "name": "string", "email": "string", "dateOfBirth": "string (ISO 8601)", "isActive?": "boolean", "familyProfile?": [...] }`
  - **Respostas:**
    - `201 Created`: Objeto do cliente recém-criado.
    - `409 Conflict`: `{ "message": "string" }` - Um cliente com o e-mail fornecido já existe.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

- **`GET /clients`**

  - **Descrição:** Lista todos os clientes com paginação.
  - **Query Params:** `?page=number&pageSize=number`
  - **Respostas:**
    - `200 OK`: Objeto paginado `{ "clients": [...], "meta": { ... } }`.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

- **`GET /clients/:clientId`**

  - **Descrição:** Retorna os detalhes de um cliente específico.
  - **Respostas:**
    - `200 OK`: Objeto do cliente.
    - `404 Not Found`: `{ "message": "string" }` - Cliente não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

- **`PUT /clients/:clientId`**

  - **Descrição:** Atualiza os dados de um cliente específico.
  - **Corpo da Requisição:** Objeto com os campos a serem atualizados.
  - **Respostas:**
    - `200 OK`: Objeto do cliente atualizado.
    - `404 Not Found`: `{ "message": "string" }` - Cliente não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

- **`DELETE /clients/:clientId`**
  - **Descrição:** Deleta um cliente específico.
  - **Respostas:**
    - `204 No Content`: Cliente deletado com sucesso.
    - `404 Not Found`: `{ "message": "string" }` - Cliente não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

---
