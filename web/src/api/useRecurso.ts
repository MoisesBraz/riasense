/**
 * Hook de leitura com cache partilhada: os 4 separadores pedem os mesmos recursos (sensores, falhas…),
 * e trocar de separador não volta a pedir à API. Um erro sai da cache, para «Tentar de novo» voltar a pedir.
 */
import { useCallback, useEffect, useState } from "react";
import { lerCamada, type Parametros, type Resultado } from "./cliente";

const cache = new Map<string, Promise<Resultado<unknown>>>();

function chaveDe(caminho: string, params: Parametros): string {
  return `${caminho}?${JSON.stringify(params)}`;
}

function obter<T>(caminho: string, params: Parametros): Promise<Resultado<T>> {
  const chave = chaveDe(caminho, params);
  let pedido = cache.get(chave);
  if (!pedido) {
    pedido = lerCamada<unknown>(caminho, params);
    cache.set(chave, pedido);
    pedido.then((r) => r.estado === "erro" && cache.delete(chave));
  }
  return pedido as Promise<Resultado<T>>;
}

/** Só para os testes: cada teste começa sem respostas guardadas. */
export function limparCache(): void {
  cache.clear();
}

export function useRecurso<T>(caminho: string, params: Parametros = {}) {
  const paramsJson = JSON.stringify(params);
  const chave = chaveDe(caminho, params);
  const [estado, setEstado] = useState<{ chave: string; resultado: Resultado<T> }>({
    chave,
    resultado: { estado: "a-carregar" },
  });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    obter<T>(caminho, JSON.parse(paramsJson) as Parametros).then((resultado) => {
      if (ativo) setEstado({ chave, resultado });
    });
    return () => {
      ativo = false;
    };
    // `versao` força um pedido novo depois de um erro («Tentar de novo»).
  }, [caminho, paramsJson, chave, versao]);

  const recarregar = useCallback(() => {
    cache.delete(chave);
    setEstado({ chave, resultado: { estado: "a-carregar" } });
    setVersao((v) => v + 1);
  }, [chave]);

  // Enquanto a chave muda (por exemplo a hora), mostra-se «a carregar», nunca a resposta da chave anterior.
  const resultado: Resultado<T> = estado.chave === chave ? estado.resultado : { estado: "a-carregar" };
  return { resultado, recarregar };
}
