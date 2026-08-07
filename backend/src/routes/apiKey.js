'use strict';

// 接口密钥管理路由
//
// 挂载点见 src/routes/index.js（router.use('/api-keys', apiKeyRoutes)），
// 父路由已统一套上 authRequired + dataScope，此处只补权限与密钥自管理限制。
//
// 两道额外闸门：
//   requirePermission('system','apikey')  只有拿到该权限点的角色能管密钥
//   denyApiKeyAuth                        禁止用密钥管理密钥，否则一把密钥能自我繁殖，
//                                         管理员就失去了对密钥生命周期的控制
const express = require('express');
const { requirePermission, denyApiKeyAuth } = require('../middleware/auth');
const apiKey = require('../controllers/apiKeyController');

const router = express.Router();

const adminOnly = [denyApiKeyAuth, requirePermission('system', 'apikey')];

router.get('/', adminOnly, apiKey.list);
router.post('/', adminOnly, apiKey.create);
router.delete('/:id', adminOnly, apiKey.remove);

module.exports = router;
