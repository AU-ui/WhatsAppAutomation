import { Router } from 'express'
import {
  getProducts, getProduct, createProduct, updateProduct, deleteProduct,
  bulkUpdateStock, getCategories, createCategory, updateCategory, deleteCategory,
} from '../controllers/product.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', getProducts)
router.post('/', createProduct)
router.get('/:id', getProduct)
router.patch('/:id', updateProduct)
router.delete('/:id', deleteProduct)
router.post('/bulk-stock', bulkUpdateStock)

router.get('/categories/all', getCategories)
router.post('/categories', createCategory)
router.patch('/categories/:id', updateCategory)
router.delete('/categories/:id', deleteCategory)

export default router
