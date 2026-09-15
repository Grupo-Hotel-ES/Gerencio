import { Router, type Request, type Response } from 'express'
import { db } from '@geroncio/shared-db'

const router = Router()

// CREATE
router.post('/funcionarios', async (req: Request, res: Response) => {
  try {
    const { nome, cpf, telefone, email, tipo, status } = req.body
    const funcionario = await db.funcionario.create({
      data: { nome, cpf, telefone, email, tipo, status },
    })
    res.status(201).json(funcionario)
  } catch (error) {
    console.error(error)
    res.status(400).json({ error: 'Não foi possível criar o funcionário.' })
  }
})

// READ — todos
router.get('/funcionarios', async (_req: Request, res: Response) => {
  const funcionarios = await db.funcionario.findMany()
  res.json(funcionarios)
})

// READ — um específico
router.get('/funcionarios/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const funcionario = await db.funcionario.findUnique({
    where: { id: Number(id) },
  })

  if (!funcionario) {
    res.status(404).json({ error: 'Funcionário não encontrado.' })
    return
  }

  res.json(funcionario)
})

// UPDATE
router.put('/funcionarios/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { nome, cpf, telefone, email, tipo, status } = req.body
    const funcionario = await db.funcionario.update({
      where: { id: Number(id) },
      data: { nome, cpf, telefone, email, tipo, status },
    })
    res.json(funcionario)
  } catch (error) {
    console.error(error)
    res.status(400).json({ error: 'Não foi possível atualizar o funcionário.' })
  }
})

// DELETE
router.delete('/funcionarios/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    await db.funcionario.delete({ where: { id: Number(id) } })
    res.status(204).send()
  } catch (error) {
    console.error(error)
    res.status(400).json({ error: 'Não foi possível deletar o funcionário.' })
  }
})

export default router