# Python para o pipeline e o ML, e não Rust

O pipeline e os modelos são em Python (DuckDB/Polars, scikit-learn, LightGBM, SHAP). Considerámos Rust, mas o ecossistema de ML em Rust não tem equivalentes maduros ao LightGBM com SHAP nem ao scikit-learn, e o desempenho que Rust daria já vem do DuckDB (C++) e do Polars (Rust), chamados a partir de Python. Quem vai manter isto no IT e na Câmara trabalha em Python, e o júri pode pedir a qualquer membro que explique o código (FAQ 17). Rust só é admitido numa peça isolada, como a API, e se quem a fizer o dominar.
