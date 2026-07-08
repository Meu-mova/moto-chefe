ALTER TYPE "os_status" ADD VALUE 'oficina' AFTER 'aberta';
ALTER TYPE "os_status" ADD VALUE 'finalizada' AFTER 'em_andamento';
ALTER TYPE "os_status" ADD VALUE 'pendente_pagamento' AFTER 'finalizada';
