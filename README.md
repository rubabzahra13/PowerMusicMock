# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Backend Setup (FastAPI)

The backend is built using Python and FastAPI, located in the `backend/` directory.

### Prerequisites
- Python 3.9+ installed on your system.

### Installation & Running

1. Open a terminal and navigate to the `backend/` folder:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```
   *(If `python` is not recognized, try `python3` or `py` on Windows)*

3. Activate the virtual environment:
   - **Windows (Command Prompt):** `venv\Scripts\activate.bat`
   - **Windows (PowerShell):** `venv\Scripts\Activate.ps1`
   - **macOS/Linux:** `source venv/bin/activate`

4. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Run the development server:
   ```bash
   uvicorn main:app --reload
   ```

### Testing the Backend
- **Health Check:** Open `http://localhost:8000/health` in your browser. It should return `{"status": "ok"}`.
- **Swagger Documentation:** Visit `http://localhost:8000/docs` to view the API schema, including the `Request` and `Person` models, and test the endpoints directly from the browser.
